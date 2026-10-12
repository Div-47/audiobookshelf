const Sequelize = require('sequelize')
const Database = require('../../Database')
const Logger = require('../../Logger')
const { profile } = require('../../utils/profiler')
const stringifySequelizeQuery = require('../stringifySequelizeQuery')

const countCache = new Map()

const libraryItemsPodcastFilters = {

  /**
   * User permissions to restrict podcasts for explicit content & tags
   * @param {import('../../models/User')} user
   * @returns {{ podcastWhere:Sequelize.WhereOptions, replacements:object }}
   */
  getUserPermissionPodcastWhereQuery(user: any) {
    const podcastWhere = []
    const replacements: Record<string, any> = {}
    if (!user.canAccessExplicitContent) {
      podcastWhere.push({
        explicit: false
      })
    }

    if (!user.permissions?.accessAllTags && user.permissions?.itemTagsSelected?.length) {
      replacements['userTagsSelected'] = user.permissions.itemTagsSelected
      if (user.permissions.selectedTagsNotAccessible) {
        podcastWhere.push(Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:userTagsSelected))`), 0))
      } else {
        podcastWhere.push(
          Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:userTagsSelected))`), {
            [Sequelize.Op.gte]: 1
          })
        )
      }
    }

    return {
      podcastWhere,
      replacements
    }
  },

  /**
   * Get where options for Podcast model
   * @param {string} group
   * @param {[string]} value
   * @returns {object} { Sequelize.WhereOptions, string[] }
   */
  getMediaGroupQuery(group: any, value: any) {
    if (!group) return { mediaWhere: {}, replacements: {} }

    let mediaWhere: Record<string, any> = {}
    const replacements: Record<string, any> = {}

    if (['genres', 'tags'].includes(group)) {
      mediaWhere[group] = Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(${group}) WHERE json_valid(${group}) AND json_each.value = :filterValue)`), {
        [Sequelize.Op.gte]: 1
      })
      replacements.filterValue = value
    } else if (group === 'languages') {
      mediaWhere['language'] = value
    } else if (group === 'explicit') {
      mediaWhere['explicit'] = true
    }

    return {
      mediaWhere,
      replacements
    }
  },

  /**
   * Get sequelize order
   * @param {string} sortBy
   * @param {boolean} sortDesc
   * @returns {Sequelize.order}
   */
  getOrder(sortBy: any, sortDesc: any) {
    const dir = sortDesc ? 'DESC' : 'ASC'
    if (sortBy === 'addedAt') {
      return [[Sequelize.literal('libraryItem.createdAt'), dir]]
    } else if (sortBy === 'size') {
      return [[Sequelize.literal('libraryItem.size'), dir]]
    } else if (sortBy === 'birthtimeMs') {
      return [[Sequelize.literal('libraryItem.birthtime'), dir]]
    } else if (sortBy === 'mtimeMs') {
      return [[Sequelize.literal('libraryItem.mtime'), dir]]
    } else if (sortBy === 'media.metadata.author') {
      const nullDir = sortDesc ? 'DESC NULLS FIRST' : 'ASC NULLS LAST'
      return [[Sequelize.literal(`\`podcast\`.\`author\` COLLATE NOCASE ${nullDir}`)]]
    } else if (sortBy === 'media.metadata.title') {
      if ((global as any).ServerSettings.sortingIgnorePrefix) {
        return [[Sequelize.literal('`libraryItem`.`titleIgnorePrefix` COLLATE NOCASE'), dir]]
      } else {
        return [[Sequelize.literal('`libraryItem`.`title` COLLATE NOCASE'), dir]]
      }
    } else if (sortBy === 'media.numTracks') {
      return [['numEpisodes', dir]]
    } else if (sortBy === 'random') {
      return [Database.sequelize.random()]
    }
    return []
  },

  clearCountCache(model: any, hook: any) {
    Logger.debug(`[LibraryItemsPodcastFilters] ${model}.${hook}: Clearing count cache`)
    countCache.clear()
  },

  async findAndCountAll(findOptions: any, model: any, limit: any, offset: any, useCountCache: any) {
    if (useCountCache) {
      const countCacheKey = stringifySequelizeQuery(findOptions)
      Logger.debug(`[LibraryItemsPodcastFilters] countCacheKey: ${countCacheKey}`)
      if (!countCache.has(countCacheKey)) {
        const count = await model.count(findOptions)
        countCache.set(countCacheKey, count)
      }

      findOptions.limit = limit || null
      findOptions.offset = offset

      const rows = await model.findAll(findOptions)

      return { rows, count: countCache.get(countCacheKey) }
    }

    findOptions.limit = limit || null
    findOptions.offset = offset

    return await model.findAndCountAll(findOptions)
  },

  /**
   * Get library items for podcast media type using filter and sort
   * @param {string} libraryId
   * @param {import('../../models/User')} user
   * @param {[string]} filterGroup
   * @param {[string]} filterValue
   * @param {string} sortBy
   * @param {string} sortDesc
   * @param {string[]} include
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<{ libraryItems: import('../../models/LibraryItem')[], count: number }>}
   */
  async getFilteredLibraryItems(libraryId: any, user: any, filterGroup: any, filterValue: any, sortBy: any, sortDesc: any, include: any, limit: any, offset: any) {
    const includeRSSFeed = include.includes('rssfeed')
    const includeNumEpisodesIncomplete = include.includes('numepisodesincomplete')

    const libraryItemWhere: Record<string, any> = {
      libraryId
    }
    const libraryItemIncludes = []
    if (filterGroup === 'feed-open' || includeRSSFeed) {
      const rssFeedRequired = filterGroup === 'feed-open'
      libraryItemIncludes.push({
        model: Database.feedModel,
        required: rssFeedRequired,
        separate: !rssFeedRequired
      })
    }
    if (filterGroup === 'issues') {
      libraryItemWhere[Sequelize.Op.or] = [
        {
          isMissing: true
        },
        {
          isInvalid: true
        }
      ]
    } else if (filterGroup === 'recent') {
      libraryItemWhere['createdAt'] = {
        [Sequelize.Op.gte]: new Date(new Date().getTime() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
      }
    }

    const podcastIncludes: any[] = []

    let { mediaWhere, replacements } = this.getMediaGroupQuery(filterGroup, filterValue)
    replacements.userId = user.id

    const podcastWhere = []
    if (Object.keys(mediaWhere).length) podcastWhere.push(mediaWhere)

    const userPermissionPodcastWhere = this.getUserPermissionPodcastWhereQuery(user)
    replacements = { ...replacements, ...userPermissionPodcastWhere.replacements }
    podcastWhere.push(...userPermissionPodcastWhere.podcastWhere)

    const findOptions = {
      where: podcastWhere,
      replacements,
      distinct: true,
      attributes: {
        include: [...podcastIncludes]
      },
      include: [
        {
          model: Database.libraryItemModel,
          required: true,
          where: libraryItemWhere,
          include: libraryItemIncludes
        }
      ],
      order: this.getOrder(sortBy, sortDesc),
      subQuery: false
    }

    const findAndCountAll = process.env.QUERY_PROFILING ? profile(this.findAndCountAll) : this.findAndCountAll

    const { rows: podcasts, count } = await findAndCountAll(findOptions, Database.podcastModel, limit, offset, !filterGroup && !userPermissionPodcastWhere.podcastWhere.length)

    const libraryItems = podcasts.map((podcastExpanded: any) => {
      const libraryItem = podcastExpanded.libraryItem
      const podcast = podcastExpanded

      delete podcast.libraryItem

      if (libraryItem.feeds?.length) {
        libraryItem.rssFeed = libraryItem.feeds[0]
      }

      if (includeNumEpisodesIncomplete) {
        const numEpisodesComplete = user.mediaProgresses.reduce((acc: any, mp: any) => {
          if (mp.podcastId === podcast.id && mp.isFinished) {
            acc += 1
          }
          return acc
        }, 0)
        libraryItem.numEpisodesIncomplete = podcast.numEpisodes - numEpisodesComplete
      }

      libraryItem.media = podcast

      return libraryItem
    })

    return {
      libraryItems,
      count
    }
  },

  /**
   * Get podcast episodes filtered and sorted
   * @param {string} libraryId
   * @param {import('../../models/User')} user
   * @param {[string]} filterGroup
   * @param {[string]} filterValue
   * @param {string} sortBy
   * @param {string} sortDesc
   * @param {number} limit
   * @param {number} offset
   * @param {boolean} isHomePage for home page shelves
   * @returns {Promise<{ libraryItems: import('../../models/LibraryItem')[], count: number }>}
   */
  async getFilteredPodcastEpisodes(libraryId: any, user: any, filterGroup: any, filterValue: any, sortBy: any, sortDesc: any, limit: any, offset: any, isHomePage = false) {
    if (sortBy === 'progress' && filterGroup !== 'progress') {
      Logger.warn('Cannot sort podcast episodes by progress without filtering by progress')
      sortBy = 'createdAt'
    }

    const podcastEpisodeIncludes = []
    let podcastEpisodeWhere: any = {}
    let libraryItemWhere: Record<string, any> = {
      libraryId
    }
    if (filterGroup === 'progress') {
      const mediaProgressWhere: Record<string, any> = {
        userId: user.id
      }
      // Respect hide from continue listening for home page shelf
      if (isHomePage) {
        mediaProgressWhere.hideFromContinueListening = false
      }
      podcastEpisodeIncludes.push({
        model: Database.mediaProgressModel,
        where: mediaProgressWhere,
        attributes: ['id', 'isFinished', 'currentTime', 'updatedAt']
      })

      if (filterValue === 'in-progress') {
        podcastEpisodeWhere = [
          {
            '$mediaProgresses.isFinished$': false
          },
          {
            '$mediaProgresses.currentTime$': {
              [Sequelize.Op.gt]: 0
            }
          }
        ]
      } else if (filterValue === 'finished') {
        podcastEpisodeWhere['$mediaProgresses.isFinished$'] = true
      }
    } else if (filterGroup === 'recent') {
      podcastEpisodeWhere['createdAt'] = {
        [Sequelize.Op.gte]: new Date(new Date().getTime() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
      }
    }

    const podcastEpisodeOrder = []
    if (sortBy === 'createdAt') {
      podcastEpisodeOrder.push(['createdAt', sortDesc ? 'DESC' : 'ASC'])
    } else if (sortBy === 'progress') {
      podcastEpisodeOrder.push([Sequelize.literal('mediaProgresses.updatedAt'), sortDesc ? 'DESC' : 'ASC'])
    }

    const userPermissionPodcastWhere = this.getUserPermissionPodcastWhereQuery(user)

    const findOptions = {
      where: podcastEpisodeWhere,
      replacements: userPermissionPodcastWhere.replacements,
      include: [
        {
          model: Database.podcastModel,
          required: true,
          where: userPermissionPodcastWhere.podcastWhere,
          include: [
            {
              model: Database.libraryItemModel,
              required: true,
              where: libraryItemWhere
            }
          ]
        },
        ...podcastEpisodeIncludes
      ],
      subQuery: false,
      order: podcastEpisodeOrder
    }

    const findAndCountAll = process.env.QUERY_PROFILING ? profile(this.findAndCountAll) : this.findAndCountAll

    const { rows: podcastEpisodes, count } = await findAndCountAll(findOptions, Database.podcastEpisodeModel, limit, offset, !filterGroup)

    const libraryItems = podcastEpisodes.map((ep: any) => {
      const libraryItem = ep.podcast.libraryItem
      const podcast = ep.podcast
      delete podcast.libraryItem
      libraryItem.media = podcast

      libraryItem.recentEpisode = ep.toOldJSON(libraryItem.id)
      return libraryItem
    })

    return {
      libraryItems,
      count
    }
  },

  /**
   * Search podcasts
   * @param {import('../../models/User')} user
   * @param {import('../../models/Library')} library
   * @param {string} query
   * @param {number} limit
   * @param {number} offset
   * @returns {{podcast:object[], tags:object[]}}
   */
  async search(user: any, library: any, query: any, limit: any, offset: any) {
    const userPermissionPodcastWhere = this.getUserPermissionPodcastWhereQuery(user)

    const textSearchQuery = await Database.createTextSearchQuery(query)

    const matchTitle = textSearchQuery.matchExpression('podcast.title')
    const matchAuthor = textSearchQuery.matchExpression('podcast.author')

    // Search title, author, itunesId, itunesArtistId
    const podcasts = await Database.podcastModel.findAll({
      where: [
        {
          [Sequelize.Op.or]: [
            Sequelize.literal(matchTitle),
            Sequelize.literal(matchAuthor),
            {
              itunesId: {
                [Sequelize.Op.substring]: query
              }
            },
            {
              itunesArtistId: {
                [Sequelize.Op.substring]: query
              }
            }
          ]
        },
        ...userPermissionPodcastWhere.podcastWhere
      ],
      replacements: userPermissionPodcastWhere.replacements,
      include: [
        {
          model: Database.libraryItemModel,
          where: {
            libraryId: library.id
          }
        }
      ],
      subQuery: false,
      distinct: true,
      limit,
      offset
    })

    const itemMatches = []

    for (const podcast of podcasts) {
      const libraryItem = podcast.libraryItem
      delete podcast.libraryItem
      libraryItem.media = podcast
      libraryItem.media.podcastEpisodes = []
      itemMatches.push({
        libraryItem: libraryItem.toOldJSONExpanded()
      })
    }

    // Search podcast episode title
    const podcastEpisodes = await Database.podcastEpisodeModel.findAll({
      where: [
        Sequelize.literal(textSearchQuery.matchExpression('podcastEpisode.title')),
        {
          '$podcast.libraryItem.libraryId$': library.id
        }
      ],
      replacements: userPermissionPodcastWhere.replacements,
      include: [
        {
          model: Database.podcastModel,
          where: [...userPermissionPodcastWhere.podcastWhere],
          include: [
            {
              model: Database.libraryItemModel
            }
          ]
        }
      ],
      distinct: true,
      offset,
      limit
    })
    const episodeMatches = []
    for (const episode of podcastEpisodes) {
      const libraryItem = episode.podcast.libraryItem
      libraryItem.media = episode.podcast
      libraryItem.media.podcastEpisodes = []
      const oldPodcastEpisodeJson = episode.toOldJSONExpanded(libraryItem.id)
      const libraryItemJson = libraryItem.toOldJSONExpanded()
      libraryItemJson.recentEpisode = oldPodcastEpisodeJson
      episodeMatches.push({
        libraryItem: libraryItemJson
      })
    }

    const matchJsonValue = textSearchQuery.matchExpression('json_each.value')

    // Search tags
    const tagMatches = []
    const [tagResults]: any = await Database.sequelize.query(`SELECT value, count(*) AS numItems FROM podcasts p, libraryItems li, json_each(p.tags) WHERE json_valid(p.tags) AND ${matchJsonValue} AND p.id = li.mediaId AND li.libraryId = :libraryId GROUP BY value ORDER BY numItems DESC LIMIT :limit OFFSET :offset;`, {
      replacements: {
        libraryId: library.id,
        limit,
        offset
      },
      raw: true
    })
    for (const row of tagResults as any[]) {
      tagMatches.push({
        name: row.value,
        numItems: row.numItems
      })
    }

    // Search genres
    const genreMatches = []
    const [genreResults]: any = await Database.sequelize.query(`SELECT value, count(*) AS numItems FROM podcasts p, libraryItems li, json_each(p.genres) WHERE json_valid(p.genres) AND ${matchJsonValue} AND p.id = li.mediaId AND li.libraryId = :libraryId GROUP BY value ORDER BY numItems DESC LIMIT :limit OFFSET :offset;`, {
      replacements: {
        libraryId: library.id,
        limit,
        offset
      },
      raw: true
    })
    for (const row of genreResults as any[]) {
      genreMatches.push({
        name: row.value,
        numItems: row.numItems
      })
    }

    return {
      podcast: itemMatches,
      tags: tagMatches,
      genres: genreMatches,
      episodes: episodeMatches
    }
  },

  /**
   * Most recent podcast episodes not finished
   * @param {import('../../models/User')} user
   * @param {import('../../models/Library')} library
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<object[]>}
   */
  async getRecentEpisodes(user: any, library: any, limit: any, offset: any) {
    const userPermissionPodcastWhere = this.getUserPermissionPodcastWhereQuery(user)

    const findOptions = {
      where: {
        '$mediaProgresses.isFinished$': {
          [Sequelize.Op.or]: [null, false]
        }
      },
      replacements: userPermissionPodcastWhere.replacements,
      include: [
        {
          model: Database.podcastModel,
          where: userPermissionPodcastWhere.podcastWhere,
          required: true,
          include: {
            model: Database.libraryItemModel,
            where: {
              libraryId: library.id
            }
          }
        },
        {
          model: Database.mediaProgressModel,
          where: {
            userId: user.id
          },
          required: false
        }
      ],
      order: [['publishedAt', 'DESC']],
      subQuery: false,
      limit,
      offset
    }

    const findtAll = process.env.QUERY_PROFILING ? profile(Database.podcastEpisodeModel.findAll.bind(Database.podcastEpisodeModel)) : Database.podcastEpisodeModel.findAll.bind(Database.podcastEpisodeModel)

    const episodes = await findtAll(findOptions)

    const episodeResults = episodes.map((ep: any) => {
      ep.podcast.podcastEpisodes = [] // Not needed
      const oldPodcastJson = ep.podcast.toOldJSON(ep.podcast.libraryItem.id)

      const oldPodcastEpisodeJson = ep.toOldJSONExpanded(ep.podcast.libraryItem.id)

      oldPodcastEpisodeJson.podcast = oldPodcastJson
      oldPodcastEpisodeJson.libraryId = ep.podcast.libraryItem.libraryId
      return oldPodcastEpisodeJson
    })

    return episodeResults
  },

  /**
   * Get stats for podcast library
   * @param {string} libraryId
   * @returns {Promise<{ totalSize:number, totalDuration:number, numAudioFiles:number, totalItems:number}>}
   */
  async getPodcastLibraryStats(libraryId: any) {
    const [sizeResults]: any = await Database.sequelize.query(`SELECT SUM(li.size) AS totalSize FROM libraryItems li WHERE li.mediaType = "podcast" AND li.libraryId = :libraryId;`, {
      replacements: {
        libraryId
      }
    })
    const [statResults]: any = await Database.sequelize.query(`SELECT SUM(json_extract(pe.audioFile, '$.duration')) AS totalDuration, COUNT(DISTINCT(li.id)) AS totalItems, COUNT(pe.id) AS numAudioFiles FROM libraryItems li, podcasts p LEFT OUTER JOIN podcastEpisodes pe ON pe.podcastId = p.id WHERE p.id = li.mediaId AND li.libraryId = :libraryId;`, {
      replacements: {
        libraryId
      }
    })
    return {
      totalDuration: statResults?.[0]?.totalDuration || 0,
      numAudioFiles: statResults?.[0]?.numAudioFiles || 0,
      totalItems: statResults?.[0]?.totalItems || 0,
      totalSize: sizeResults?.[0]?.totalSize || 0
    }
  },

  /**
   * Genres with num podcasts
   * @param {string} libraryId
   * @returns {{genre:string, count:number}[]}
   */
  async getGenresWithCount(libraryId: any) {
    const genres = []
    const [genreResults]: any = await Database.sequelize.query(`SELECT value, count(*) AS numItems FROM podcasts p, libraryItems li, json_each(p.genres) WHERE json_valid(p.genres) AND p.id = li.mediaId AND li.libraryId = :libraryId GROUP BY value ORDER BY numItems DESC;`, {
      replacements: {
        libraryId
      },
      raw: true
    })
    for (const row of genreResults as any[]) {
      genres.push({
        genre: row.value,
        count: row.numItems
      })
    }
    return genres
  },

  /**
   * Get longest podcasts in library
   * @param {string} libraryId
   * @param {number} limit
   * @returns {Promise<{ id:string, title:string, duration:number }[]>}
   */
  async getLongestPodcasts(libraryId: any, limit: any) {
    const podcasts = await Database.podcastModel.findAll({
      attributes: ['id', 'title', [Sequelize.literal(`(SELECT SUM(json_extract(pe.audioFile, '$.duration')) FROM podcastEpisodes pe WHERE pe.podcastId = podcast.id)`), 'duration']],
      include: {
        model: Database.libraryItemModel,
        attributes: ['id', 'libraryId'],
        where: {
          libraryId
        }
      },
      order: [['duration', 'DESC']],
      limit
    })
    return podcasts.map((podcast: any) => {
      return {
        id: podcast.libraryItem.id,
        title: podcast.title,
        duration: podcast.dataValues.duration
      }
    })
  }
}

export default libraryItemsPodcastFilters
module.exports = libraryItemsPodcastFilters
