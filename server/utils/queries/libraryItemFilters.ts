const Sequelize = require('sequelize')
const Database = require('../../Database')
const libraryItemsBookFilters = require('./libraryItemsBookFilters')
const libraryItemsPodcastFilters = require('./libraryItemsPodcastFilters')

export interface LargestItem {
  id: string
  title: string
  size: number
}

export interface LibraryItemSearchResult {
  book?: any[]
  narrators?: any[]
  authors?: any[]
  tags?: any[]
  series?: any[]
  podcast?: any[]
}

const libraryItemFilters = {
  /**
   * Get all library items that have tags
   */
  async getAllLibraryItemsWithTags(tags: string[]): Promise<any[]> {
    const libraryItems: any[] = []
    const booksWithTag = await Database.bookModel.findAll({
      where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:tags))`), {
        [Sequelize.Op.gte]: 1
      }),
      replacements: {
        tags
      },
      include: [
        {
          model: Database.libraryItemModel
        },
        {
          model: Database.authorModel,
          through: {
            attributes: []
          }
        },
        {
          model: Database.seriesModel,
          through: {
            attributes: ['sequence']
          }
        }
      ],
      order: [
        [Database.authorModel, Database.bookAuthorModel, 'createdAt', 'ASC'],
        [Database.seriesModel, 'bookSeries', 'createdAt', 'ASC']
      ]
    })
    for (const book of booksWithTag) {
      const libraryItem = book.libraryItem
      libraryItem.media = book
      libraryItems.push(libraryItem)
    }
    const podcastsWithTag = await Database.podcastModel.findAll({
      where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:tags))`), {
        [Sequelize.Op.gte]: 1
      }),
      replacements: {
        tags
      },
      include: [
        {
          model: Database.libraryItemModel
        },
        {
          model: Database.podcastEpisodeModel
        }
      ]
    })
    for (const podcast of podcastsWithTag) {
      const libraryItem = podcast.libraryItem
      libraryItem.media = podcast
      libraryItems.push(libraryItem)
    }
    return libraryItems
  },

  /**
   * Get all library items that have genres
   */
  async getAllLibraryItemsWithGenres(genres: string[]): Promise<any[]> {
    const libraryItems: any[] = []
    const booksWithGenre = await Database.bookModel.findAll({
      where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(genres) WHERE json_valid(genres) AND json_each.value IN (:genres))`), {
        [Sequelize.Op.gte]: 1
      }),
      replacements: {
        genres
      },
      include: [
        {
          model: Database.libraryItemModel
        },
        {
          model: Database.authorModel,
          through: {
            attributes: []
          }
        },
        {
          model: Database.seriesModel,
          through: {
            attributes: ['sequence']
          }
        }
      ]
    })
    for (const book of booksWithGenre) {
      const libraryItem = book.libraryItem
      libraryItem.media = book
      libraryItems.push(libraryItem)
    }
    const podcastsWithGenre = await Database.podcastModel.findAll({
      where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(genres) WHERE json_valid(genres) AND json_each.value IN (:genres))`), {
        [Sequelize.Op.gte]: 1
      }),
      replacements: {
        genres
      },
      include: [
        {
          model: Database.libraryItemModel
        },
        {
          model: Database.podcastEpisodeModel
        }
      ]
    })
    for (const podcast of podcastsWithGenre) {
      const libraryItem = podcast.libraryItem
      libraryItem.media = podcast
      libraryItems.push(libraryItem)
    }
    return libraryItems
  },

  /**
   * Get all library items that have narrators
   */
  async getAllLibraryItemsWithNarrators(narrators: string[], libraryId: string): Promise<any[]> {
    const libraryItems: any[] = []
    const booksWithGenre = await Database.bookModel.findAll({
      where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(narrators) WHERE json_valid(narrators) AND json_each.value IN (:narrators))`), {
        [Sequelize.Op.gte]: 1
      }),
      replacements: {
        narrators
      },
      include: [
        {
          model: Database.libraryItemModel,
          where: { libraryId }
        },
        {
          model: Database.authorModel,
          through: {
            attributes: []
          }
        },
        {
          model: Database.seriesModel,
          through: {
            attributes: ['sequence']
          }
        }
      ]
    })
    for (const book of booksWithGenre) {
      const libraryItem = book.libraryItem
      libraryItem.media = book
      libraryItems.push(libraryItem)
    }
    return libraryItems
  },

  /**
   * Search library items
   */
  search(user: any, library: any, query: string, limit: number): LibraryItemSearchResult {
    if (library.isBook) {
      return libraryItemsBookFilters.search(user, library, query, limit, 0)
    } else {
      return libraryItemsPodcastFilters.search(user, library, query, limit, 0)
    }
  },

  /**
   * Get largest items in library
   */
  async getLargestItems(libraryId: string, limit: number): Promise<LargestItem[]> {
    const libraryItems = await Database.libraryItemModel.findAll({
      attributes: ['id', 'mediaId', 'mediaType', 'size'],
      where: {
        libraryId
      },
      include: [
        {
          model: Database.bookModel,
          attributes: ['id', 'title']
        },
        {
          model: Database.podcastModel,
          attributes: ['id', 'title']
        }
      ],
      order: [['size', 'DESC']],
      limit
    })
    return libraryItems.map((libraryItem: any) => {
      return {
        id: libraryItem.id,
        title: libraryItem.media.title,
        size: libraryItem.size
      }
    })
  }
}

module.exports = libraryItemFilters
