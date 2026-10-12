import { DataTypes, Model, Transaction } from 'sequelize'
import Logger from '../Logger'
import libraryItemsPodcastFilters from '../utils/queries/libraryItemsPodcastFilters'
import PodcastEpisode, { ChapterObject } from './PodcastEpisode'
import { AudioTrack } from './Book'

const { getTitlePrefixAtEnd, getTitleIgnorePrefix } = require('../utils')
const htmlSanitizer = require('../utils/htmlSanitizer')


export interface PodcastExpandedProperties {
  podcastEpisodes: PodcastEpisode[]
}

export type PodcastExpanded = Podcast & PodcastExpandedProperties

class Podcast extends Model {
  declare id: string
  declare title: string
  declare titleIgnorePrefix: string
  declare author: string
  declare releaseDate: string
  declare feedURL: string
  declare imageURL: string
  declare description: string
  declare itunesPageURL: string
  declare itunesId: string
  declare itunesArtistId: string
  declare language: string
  declare podcastType: string
  declare explicit: boolean
  declare autoDownloadEpisodes: boolean
  declare autoDownloadSchedule: string
  declare lastEpisodeCheck: Date | null
  declare maxEpisodesToKeep: number
  declare maxNewEpisodesToDownload: number
  declare coverPath: string
  declare tags: string[]
  declare genres: string[]
  declare createdAt: Date
  declare updatedAt: Date
  declare numEpisodes: number

  declare podcastEpisodes: PodcastEpisode[]

  /**
   * Payload from the /api/podcasts POST endpoint
   *
   * @param {Object} payload
   * @param {import('sequelize').Transaction} transaction
   */
  static async createFromRequest(payload: any, transaction?: Transaction): Promise<Podcast> {
    const title = typeof payload.metadata?.title === 'string' ? payload.metadata.title : null
    // cron expression validated in controller
    const autoDownloadSchedule = typeof payload.autoDownloadSchedule === 'string' ? payload.autoDownloadSchedule : null
    const genres = Array.isArray(payload.metadata?.genres) && payload.metadata.genres.every((g: any) => typeof g === 'string' && g.length) ? payload.metadata.genres : []
    const tags = Array.isArray(payload.tags) && payload.tags.every((t: any) => typeof t === 'string' && t.length) ? payload.tags : []

    const stringKeys = ['title', 'author', 'releaseDate', 'feedUrl', 'imageUrl', 'description', 'itunesPageUrl', 'itunesId', 'itunesArtistId', 'language', 'type']
    if (payload.metadata) {
      stringKeys.forEach((key) => {
        if (typeof payload.metadata[key] === 'number') {
          payload.metadata[key] = String(payload.metadata[key])
        }
      })
    }

    const rawDescription = typeof payload.metadata?.description === 'string' ? payload.metadata.description : null
    const description = rawDescription ? htmlSanitizer.sanitize(rawDescription) : null

    return (this as any).create(
      {
        title,
        titleIgnorePrefix: getTitleIgnorePrefix(title),
        author: typeof payload.metadata?.author === 'string' ? payload.metadata.author : null,
        releaseDate: typeof payload.metadata?.releaseDate === 'string' ? payload.metadata.releaseDate : null,
        feedURL: typeof payload.metadata?.feedUrl === 'string' ? payload.metadata.feedUrl : null,
        imageURL: typeof payload.metadata?.imageUrl === 'string' ? payload.metadata.imageUrl : null,
        description,
        itunesPageURL: typeof payload.metadata?.itunesPageUrl === 'string' ? payload.metadata.itunesPageUrl : null,
        itunesId: typeof payload.metadata?.itunesId === 'string' ? payload.metadata.itunesId : null,
        itunesArtistId: typeof payload.metadata?.itunesArtistId === 'string' ? payload.metadata.itunesArtistId : null,
        language: typeof payload.metadata?.language === 'string' ? payload.metadata.language : null,
        podcastType: typeof payload.metadata?.type === 'string' ? payload.metadata.type : null,
        explicit: !!payload.metadata?.explicit,
        autoDownloadEpisodes: !!payload.autoDownloadEpisodes,
        autoDownloadSchedule: autoDownloadSchedule || (global as any).ServerSettings?.podcastEpisodeSchedule,
        lastEpisodeCheck: new Date(),
        maxEpisodesToKeep: 0,
        maxNewEpisodesToDownload: 3,
        tags,
        genres
      },
      { transaction }
    )
  }

  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize: any): any {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        title: DataTypes.STRING,
        titleIgnorePrefix: DataTypes.STRING,
        author: DataTypes.STRING,
        releaseDate: DataTypes.STRING,
        feedURL: DataTypes.STRING,
        imageURL: DataTypes.STRING,
        description: DataTypes.TEXT,
        itunesPageURL: DataTypes.STRING,
        itunesId: DataTypes.STRING,
        itunesArtistId: DataTypes.STRING,
        language: DataTypes.STRING,
        podcastType: DataTypes.STRING,
        explicit: DataTypes.BOOLEAN,

        autoDownloadEpisodes: DataTypes.BOOLEAN,
        autoDownloadSchedule: DataTypes.STRING,
        lastEpisodeCheck: DataTypes.DATE,
        maxEpisodesToKeep: DataTypes.INTEGER,
        maxNewEpisodesToDownload: DataTypes.INTEGER,
        coverPath: DataTypes.STRING,
        tags: DataTypes.JSON,
        genres: DataTypes.JSON,
        numEpisodes: DataTypes.INTEGER
      },
      {
        sequelize,
        modelName: 'podcast'
      }
    )

    Podcast.addHook('afterDestroy', async () => {
      libraryItemsPodcastFilters.clearCountCache('podcast', 'afterDestroy')
    })

    Podcast.addHook('afterCreate', async () => {
      libraryItemsPodcastFilters.clearCountCache('podcast', 'afterCreate')
    })

    return Podcast
  }

  get hasMediaFiles(): boolean {
    return !!this.podcastEpisodes?.length
  }

  get hasAudioTracks(): boolean {
    return this.hasMediaFiles
  }

  get size(): number {
    if (!this.podcastEpisodes?.length) return 0
    return this.podcastEpisodes.reduce((total, episode) => total + episode.size, 0)
  }

  getAbsMetadataJson(): any {
    return {
      tags: this.tags || [],
      title: this.title,
      author: this.author,
      description: this.description,
      releaseDate: this.releaseDate,
      genres: this.genres || [],
      feedURL: this.feedURL,
      imageURL: this.imageURL,
      itunesPageURL: this.itunesPageURL,
      itunesId: this.itunesId,
      itunesArtistId: this.itunesArtistId,
      language: this.language,
      explicit: !!this.explicit,
      podcastType: this.podcastType
    }
  }

  /**
   *
   * @param {Object} payload - Old podcast object
   * @returns {Promise<boolean>}
   */
  async updateFromRequest(payload: any): Promise<boolean> {
    if (!payload) return false

    let hasUpdates = false

    if (payload.metadata) {
      const stringKeys = ['title', 'author', 'releaseDate', 'feedUrl', 'imageUrl', 'description', 'itunesPageUrl', 'itunesId', 'itunesArtistId', 'language', 'type']
      stringKeys.forEach((key) => {
        // Convert numbers to strings
        if (typeof payload.metadata[key] === 'number') {
          payload.metadata[key] = String(payload.metadata[key])
        }

        let newKey = key
        if (key === 'type') {
          newKey = 'podcastType'
        } else if (key === 'feedUrl') {
          newKey = 'feedURL'
        } else if (key === 'imageUrl') {
          newKey = 'imageURL'
        } else if (key === 'itunesPageUrl') {
          newKey = 'itunesPageURL'
        }
        if ((typeof payload.metadata[key] === 'string' || payload.metadata[key] === null) && payload.metadata[key] !== (this as any)[newKey]) {
          // Sanitize description HTML
          if (key === 'description' && payload.metadata[key]) {
            const sanitizedDescription = htmlSanitizer.sanitize(payload.metadata[key])
            if (sanitizedDescription !== payload.metadata[key]) {
              Logger.debug(`[Podcast] "${this.title}" Sanitized description from "${payload.metadata[key]}" to "${sanitizedDescription}"`)
              payload.metadata[key] = sanitizedDescription
            }
          }

          ;(this as any)[newKey] = payload.metadata[key] || null

          if (key === 'title') {
            this.titleIgnorePrefix = getTitleIgnorePrefix(this.title)
          }

          hasUpdates = true
        }
      })

      if (payload.metadata.explicit !== undefined && payload.metadata.explicit !== this.explicit) {
        this.explicit = !!payload.metadata.explicit
        hasUpdates = true
      }

      if (Array.isArray(payload.metadata.genres) && !payload.metadata.genres.some((item: any) => typeof item !== 'string') && JSON.stringify(this.genres) !== JSON.stringify(payload.metadata.genres)) {
        this.genres = payload.metadata.genres
        this.changed('genres', true)
        hasUpdates = true
      }
    }

    if (Array.isArray(payload.tags) && !payload.tags.some((item: any) => typeof item !== 'string') && JSON.stringify(this.tags) !== JSON.stringify(payload.tags)) {
      this.tags = payload.tags
      this.changed('tags', true)
      hasUpdates = true
    }

    if (payload.autoDownloadEpisodes !== undefined && payload.autoDownloadEpisodes !== this.autoDownloadEpisodes) {
      this.autoDownloadEpisodes = !!payload.autoDownloadEpisodes
      hasUpdates = true
    }
    if (typeof payload.autoDownloadSchedule === 'string' && payload.autoDownloadSchedule !== this.autoDownloadSchedule) {
      // cron expression validated in controller
      this.autoDownloadSchedule = payload.autoDownloadSchedule
      hasUpdates = true
    }
    if (typeof payload.lastEpisodeCheck === 'number' && payload.lastEpisodeCheck !== this.lastEpisodeCheck?.valueOf()) {
      this.lastEpisodeCheck = new Date(payload.lastEpisodeCheck)
      hasUpdates = true
    }

    const numberKeys = ['maxEpisodesToKeep', 'maxNewEpisodesToDownload']
    numberKeys.forEach((key) => {
      if (typeof payload[key] === 'number' && payload[key] !== (this as any)[key]) {
        ;(this as any)[key] = payload[key]
        hasUpdates = true
      }
    })

    if (hasUpdates) {
      Logger.debug(`[Podcast] changed keys:`, this.changed())
      await this.save()
    }

    return hasUpdates
  }

  checkCanDirectPlay(supportedMimeTypes: string[], episodeId: string): boolean {
    if (!Array.isArray(supportedMimeTypes)) {
      Logger.error(`[Podcast] checkCanDirectPlay: supportedMimeTypes is not an array`, supportedMimeTypes)
      return false
    }
    const episode = this.podcastEpisodes.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[Podcast] checkCanDirectPlay: episode not found`, episodeId)
      return false
    }
    return supportedMimeTypes.includes(episode.audioFile.mimeType)
  }

  /**
   * Get the track list to be used in client audio players
   * AudioTrack is the AudioFile with startOffset and contentUrl
   * Podcast episodes only have one track
   *
   * @param {string} libraryItemId
   * @param {string} episodeId
   * @returns {import('./Book').AudioTrack[]}
   */
  getTracklist(libraryItemId: string, episodeId: string): AudioTrack[] {
    const episode = this.podcastEpisodes.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[Podcast] getTracklist: episode not found`, episodeId)
      return []
    }

    const audioTrack = episode.getAudioTrack(libraryItemId)
    return [audioTrack]
  }

  /**
   *
   * @param {string} episodeId
   * @returns {import('./PodcastEpisode').ChapterObject[]}
   */
  getChapters(episodeId: string): ChapterObject[] {
    const episode = this.podcastEpisodes.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[Podcast] getChapters: episode not found`, episodeId)
      return []
    }

    return structuredClone(episode.chapters) || []
  }

  getPlaybackTitle(episodeId: string): string {
    const episode = this.podcastEpisodes.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[Podcast] getPlaybackTitle: episode not found`, episodeId)
      return ''
    }

    return episode.title
  }

  getPlaybackAuthor(): string {
    return this.author
  }

  getPlaybackDuration(episodeId: string): number {
    const episode = this.podcastEpisodes.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[Podcast] getPlaybackDuration: episode not found`, episodeId)
      return 0
    }

    return episode.duration
  }

  /**
   *
   * @returns {number} - Unix timestamp
   */
  getLatestEpisodePublishedAt(): number {
    return this.podcastEpisodes.reduce((latest, episode) => {
      if (episode.publishedAt?.valueOf() > latest) {
        return episode.publishedAt.valueOf()
      }
      return latest
    }, 0)
  }

  /**
   * Used for checking if an rss feed episode is already in the podcast
   *
   * @param {import('../utils/podcastUtils').RssPodcastEpisode} feedEpisode - object from rss feed
   * @returns {boolean}
   */
  checkHasEpisodeByFeedEpisode(feedEpisode: any): boolean {
    const guid = feedEpisode.guid
    const url = feedEpisode.enclosure.url
    return this.podcastEpisodes.some((ep) => ep.checkMatchesGuidOrEnclosureUrl(guid, url))
  }

  /**
   * Old model kept metadata in a separate object
   */
  oldMetadataToJSON(): any {
    return {
      title: this.title,
      author: this.author,
      description: this.description,
      releaseDate: this.releaseDate,
      genres: [...(this.genres || [])],
      feedUrl: this.feedURL,
      imageUrl: this.imageURL,
      itunesPageUrl: this.itunesPageURL,
      itunesId: this.itunesId,
      itunesArtistId: this.itunesArtistId,
      explicit: this.explicit,
      language: this.language,
      type: this.podcastType
    }
  }

  oldMetadataToJSONExpanded(): any {
    const oldMetadataJSON = this.oldMetadataToJSON()
    oldMetadataJSON.titleIgnorePrefix = getTitlePrefixAtEnd(this.title)
    return oldMetadataJSON
  }

  /**
   * The old model stored episodes with the podcast object
   *
   * @param {string} libraryItemId
   */
  toOldJSON(libraryItemId: string): any {
    if (!libraryItemId) {
      throw new Error(`[Podcast] Cannot convert to old JSON because libraryItemId is not provided`)
    }
    if (!this.podcastEpisodes) {
      throw new Error(`[Podcast] Cannot convert to old JSON because episodes are not provided`)
    }

    return {
      id: this.id,
      libraryItemId: libraryItemId,
      metadata: this.oldMetadataToJSON(),
      coverPath: this.coverPath,
      tags: [...(this.tags || [])],
      episodes: this.podcastEpisodes.map((episode) => episode.toOldJSON(libraryItemId)),
      autoDownloadEpisodes: this.autoDownloadEpisodes,
      autoDownloadSchedule: this.autoDownloadSchedule,
      lastEpisodeCheck: this.lastEpisodeCheck?.valueOf() || null,
      maxEpisodesToKeep: this.maxEpisodesToKeep,
      maxNewEpisodesToDownload: this.maxNewEpisodesToDownload
    }
  }

  /**
   * Minified podcast JSON for list/shelf endpoints.
   * `toOldJSONExpanded()` must be a strict superset: every key here must exist in expanded
   * with the same value semantics. Only additive changes to expanded; never remove or rename keys.
   */
  toOldJSONMinified(): any {
    return {
      id: this.id,
      // Minified metadata and expanded metadata are the same
      metadata: this.oldMetadataToJSONExpanded(),
      coverPath: this.coverPath,
      tags: [...(this.tags || [])],
      numEpisodes: this.podcastEpisodes?.length || 0,
      autoDownloadEpisodes: this.autoDownloadEpisodes,
      autoDownloadSchedule: this.autoDownloadSchedule,
      lastEpisodeCheck: this.lastEpisodeCheck?.valueOf() || null,
      maxEpisodesToKeep: this.maxEpisodesToKeep,
      maxNewEpisodesToDownload: this.maxNewEpisodesToDownload,
      size: this.size
    }
  }

  /**
   * Expanded podcast JSON for item detail and socket events.
   * Must be a strict superset of `toOldJSONMinified()` — built by spreading minified, then adding expanded-only fields.
   *
   * @param {string} libraryItemId
   */
  toOldJSONExpanded(libraryItemId: string): any {
    if (!libraryItemId) {
      throw new Error(`[Podcast] Cannot convert to old JSON because libraryItemId is not provided`)
    }
    if (!this.podcastEpisodes) {
      throw new Error(`[Podcast] Cannot convert to old JSON because episodes are not provided`)
    }

    return {
      ...this.toOldJSONMinified(),
      libraryItemId,
      episodes: this.podcastEpisodes.map((e) => e.toOldJSONExpanded(libraryItemId))
    }
  }
}

export default Podcast
module.exports = Podcast
