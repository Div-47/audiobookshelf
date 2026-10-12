const Sequelize = require('sequelize')
const Database = require('../../Database')
const PlaybackSession = require('../../models/PlaybackSession')
const fsExtra = require('../../libs/fsExtra')

export interface SizeObject {
  totalSize: number
  numItems: number
}

export interface AdminStatsForYear {
  numListeningSessions: number
  numBooksAdded: number
  numAuthorsAdded: number
  totalBooksAddedSize: number
  totalBooksAddedDuration: number
  booksAddedWithCovers: string[]
  totalBooksSize: number
  totalBooksDuration: number
  totalListeningTime: number
  numBooks: number
  topAuthors: Array<{ name: string; time: number }> | null
  topNarrators: Array<{ name: string; time: number }> | null
  topGenres: Array<{ genre: string; time: number }> | null
}

module.exports = {
  /**
   *
   * @param {number} year YYYY
   * @returns {Promise<any[]>}
   */
  async getListeningSessionsForYear(year: number): Promise<any[]> {
    const sessions = await Database.playbackSessionModel.findAll({
      where: {
        createdAt: {
          [Sequelize.Op.gte]: `${year}-01-01`,
          [Sequelize.Op.lt]: `${year + 1}-01-01`
        }
      }
    })
    return sessions
  },

  /**
   *
   * @param {number} year YYYY
   * @returns {Promise<number>}
   */
  async getNumAuthorsAddedForYear(year: number): Promise<number> {
    const count = await Database.authorModel.count({
      where: {
        createdAt: {
          [Sequelize.Op.gte]: `${year}-01-01`,
          [Sequelize.Op.lt]: `${year + 1}-01-01`
        }
      }
    })
    return count
  },

  /**
   *
   * @param {number} year YYYY
   * @returns {Promise<any[]>}
   */
  async getBooksAddedForYear(year: number): Promise<any[]> {
    const books = await Database.bookModel.findAll({
      attributes: ['id', 'title', 'coverPath', 'duration', 'createdAt'],
      where: {
        createdAt: {
          [Sequelize.Op.gte]: `${year}-01-01`,
          [Sequelize.Op.lt]: `${year + 1}-01-01`
        }
      },
      include: {
        model: Database.libraryItemModel,
        attributes: ['id', 'mediaId', 'mediaType', 'size'],
        required: true
      },
      order: Database.sequelize.random()
    })
    return books
  },

  /**
   *
   * @param {number} year YYYY
   * @returns {Promise<AdminStatsForYear>}
   */
  async getStatsForYear(year: number): Promise<AdminStatsForYear> {
    const booksAdded = await this.getBooksAddedForYear(year)

    let totalBooksAddedSize = 0
    let totalBooksAddedDuration = 0
    const booksWithCovers: string[] = []

    for (const book of booksAdded) {
      // Grab first 25 that have a cover
      if (book.coverPath && !booksWithCovers.includes(book.libraryItem.id) && booksWithCovers.length < 25 && (await fsExtra.pathExists(book.coverPath))) {
        booksWithCovers.push(book.libraryItem.id)
      }
      if (book.duration && !isNaN(book.duration)) {
        totalBooksAddedDuration += book.duration
      }
      if (book.libraryItem.size && !isNaN(book.libraryItem.size)) {
        totalBooksAddedSize += book.libraryItem.size
      }
    }

    const numAuthorsAdded = await this.getNumAuthorsAddedForYear(year)

    let authorListeningMap: Record<string, number> = {}
    let narratorListeningMap: Record<string, number> = {}
    let genreListeningMap: Record<string, number> = {}

    const listeningSessions = await this.getListeningSessionsForYear(year)
    let totalListeningTime = 0
    for (const ls of listeningSessions) {
      totalListeningTime += ls.timeListening || 0

      const authors = ls.mediaMetadata?.authors || []
      authors.forEach((au: { name: string }) => {
        if (!authorListeningMap[au.name]) authorListeningMap[au.name] = 0
        authorListeningMap[au.name] += ls.timeListening || 0
      })

      const narrators = ls.mediaMetadata?.narrators || []
      narrators.forEach((narrator: string) => {
        if (!narratorListeningMap[narrator]) narratorListeningMap[narrator] = 0
        narratorListeningMap[narrator] += ls.timeListening || 0
      })

      // Filter out bad genres like "audiobook" and "audio book"
      const genres = (ls.mediaMetadata?.genres || []).filter((g: string) => g && !g.toLowerCase().includes('audiobook') && !g.toLowerCase().includes('audio book'))
      genres.forEach((genre: string) => {
        if (!genreListeningMap[genre]) genreListeningMap[genre] = 0
        genreListeningMap[genre] += ls.timeListening || 0
      })
    }

    let topAuthors = null
    topAuthors = Object.keys(authorListeningMap)
      .map((authorName) => ({
        name: authorName,
        time: Math.round(authorListeningMap[authorName])
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3)

    let topNarrators = null
    topNarrators = Object.keys(narratorListeningMap)
      .map((narratorName) => ({
        name: narratorName,
        time: Math.round(narratorListeningMap[narratorName])
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3)

    let topGenres = null
    topGenres = Object.keys(genreListeningMap)
      .map((genre) => ({
        genre,
        time: Math.round(genreListeningMap[genre])
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3)

    // Stats for total books, size and duration for everything added this year or earlier
    const [totalStatResultsRow]: any = await Database.sequelize.query(`SELECT SUM(li.size) AS totalSize, SUM(b.duration) AS totalDuration, COUNT(*) AS totalItems FROM libraryItems li, books b WHERE b.id = li.mediaId AND li.mediaType = 'book' AND li.createdAt < ":nextYear-01-01";`, {
      replacements: {
        nextYear: year + 1
      }
    })
    const totalStatResults = totalStatResultsRow[0]

    return {
      numListeningSessions: listeningSessions.length,
      numBooksAdded: booksAdded.length,
      numAuthorsAdded,
      totalBooksAddedSize,
      totalBooksAddedDuration: Math.round(totalBooksAddedDuration),
      booksAddedWithCovers: booksWithCovers,
      totalBooksSize: totalStatResults?.totalSize || 0,
      totalBooksDuration: totalStatResults?.totalDuration || 0,
      totalListeningTime,
      numBooks: totalStatResults?.totalItems || 0,
      topAuthors,
      topNarrators,
      topGenres
    }
  },

  /**
   * Get total file size and number of items for books and podcasts
   *
   * @returns {Promise<{books: SizeObject, podcasts: SizeObject, total: SizeObject}>}
   */
  async getTotalSize(): Promise<{ books: SizeObject; podcasts: SizeObject; total: SizeObject }> {
    const [mediaTypeStats]: any = await Database.sequelize.query(`SELECT li.mediaType, SUM(li.size) AS totalSize, COUNT(*) AS numItems FROM libraryItems li group by li.mediaType;`)
    const bookStats = mediaTypeStats.find((m: any) => m.mediaType === 'book')
    const podcastStats = mediaTypeStats.find((m: any) => m.mediaType === 'podcast')

    return {
      books: {
        totalSize: bookStats?.totalSize || 0,
        numItems: bookStats?.numItems || 0
      },
      podcasts: {
        totalSize: podcastStats?.totalSize || 0,
        numItems: podcastStats?.numItems || 0
      },
      total: {
        totalSize: (bookStats?.totalSize || 0) + (podcastStats?.totalSize || 0),
        numItems: (bookStats?.numItems || 0) + (podcastStats?.numItems || 0)
      }
    }
  },

  /**
   * Get total number of audio files for books and podcasts
   *
   * @returns {Promise<{numBookAudioFiles: number, numPodcastAudioFiles: number, numAudioFiles: number}>}
   */
  async getNumAudioFiles(): Promise<{ numBookAudioFiles: number; numPodcastAudioFiles: number; numAudioFiles: number }> {
    const [numBookAudioFilesRow]: any = await Database.sequelize.query(`SELECT SUM(json_array_length(b.audioFiles)) AS numAudioFiles FROM books b;`)
    const numBookAudioFiles = numBookAudioFilesRow[0]?.numAudioFiles || 0
    const numPodcastAudioFiles = await Database.podcastEpisodeModel.count()
    return {
      numBookAudioFiles,
      numPodcastAudioFiles,
      numAudioFiles: numBookAudioFiles + numPodcastAudioFiles
    }
  }
}
