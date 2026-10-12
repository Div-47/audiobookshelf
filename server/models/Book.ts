import { DataTypes, Model } from 'sequelize'
import Logger from '../Logger'
import parseNameString from '../utils/parsers/parseNameString'
import libraryItemsBookFilters from '../utils/queries/libraryItemsBookFilters'
import SocketAuthority from '../SocketAuthority'
import type Author from './Author'
import type Series from './Series'

const { getTitlePrefixAtEnd, getTitleIgnorePrefix } = require('../utils')
const htmlSanitizer = require('../utils/htmlSanitizer')


export interface EBookFileObject {
  ino: string
  ebookFormat: string
  addedAt: number
  updatedAt: number
  metadata: {
    filename: string
    ext: string
    path: string
    relPath: string
    size: number
    mtimeMs: number
    ctimeMs: number
    birthtimeMs: number
  }
}

export interface ChapterObject {
  id: number
  start: number
  end: number
  title: string
}

export interface SeriesExpandedProperties {
  bookSeries: { sequence: string }
}

export type SeriesExpanded = Series & SeriesExpandedProperties

export interface BookExpandedProperties {
  authors: Author[]
  series: SeriesExpanded[]
}

export type BookExpanded = Book & BookExpandedProperties

export interface BookExpandedWithLibraryItemProperties {
  libraryItem: any
}

export type BookExpandedWithLibraryItem = BookExpanded & BookExpandedWithLibraryItemProperties

export interface AudioFileObject {
  index: number
  ino: string
  metadata: {
    filename: string
    ext: string
    path: string
    relPath: string
    size: number
    mtimeMs: number
    ctimeMs: number
    birthtimeMs: number
  }
  addedAt: number
  updatedAt: number
  trackNumFromMeta?: number
  discNumFromMeta?: number
  trackNumFromFilename?: number
  discNumFromFilename?: number
  manuallyVerified?: boolean
  format?: string
  duration: number
  bitRate?: number
  language?: string
  codec?: string
  timeBase?: string
  channels?: number
  channelLayout?: string
  chapters?: ChapterObject[]
  metaTags?: Record<string, any>
  mimeType: string
  exclude?: boolean
}

export interface AudioTrackProperties {
  title: string
  contentUrl: string
  startOffset: number
}

export type AudioTrack = AudioFileObject & AudioTrackProperties

class Book extends Model {
  declare id: string
  declare title: string
  declare titleIgnorePrefix: string
  declare subtitle: string
  declare publishedYear: string
  declare publishedDate: string
  declare publisher: string
  declare description: string
  declare isbn: string
  declare asin: string
  declare language: string
  declare explicit: boolean
  declare abridged: boolean
  declare coverPath: string
  declare duration: number
  declare narrators: string[]
  declare audioFiles: AudioFileObject[]
  declare ebookFile: EBookFileObject
  declare chapters: ChapterObject[]
  declare tags: string[]
  declare genres: string[]
  declare updatedAt: Date
  declare createdAt: Date

  // Expanded properties
  declare authors: Author[]
  declare series: SeriesExpanded[]

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
        subtitle: DataTypes.STRING,
        publishedYear: DataTypes.STRING,
        publishedDate: DataTypes.STRING,
        publisher: DataTypes.STRING,
        description: DataTypes.TEXT,
        isbn: DataTypes.STRING,
        asin: DataTypes.STRING,
        language: DataTypes.STRING,
        explicit: DataTypes.BOOLEAN,
        abridged: DataTypes.BOOLEAN,
        coverPath: DataTypes.STRING,
        duration: DataTypes.FLOAT,

        narrators: DataTypes.JSON,
        audioFiles: DataTypes.JSON,
        ebookFile: DataTypes.JSON,
        chapters: DataTypes.JSON,
        tags: DataTypes.JSON,
        genres: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'book',
        indexes: [
          {
            fields: [
              {
                name: 'title',
                collate: 'NOCASE'
              }
            ]
          },
          {
            fields: ['publishedYear']
          },
          {
            fields: ['duration']
          }
        ]
      }
    )

    Book.addHook('afterDestroy', async () => {
      libraryItemsBookFilters.clearCountCache('afterDestroy')
    })

    Book.addHook('afterCreate', async () => {
      libraryItemsBookFilters.clearCountCache('afterCreate')
    })

    return Book
  }

  /**
   * Comma separated array of author names
   * Requires authors to be loaded
   *
   * @returns {string}
   */
  get authorName(): string {
    if (this.authors === undefined) {
      Logger.error(`[Book] authorName: Cannot get authorName because authors are not loaded`)
      return ''
    }
    return this.authors.map((au) => au.name).join(', ')
  }

  /**
   * Comma separated array of author names in Last, First format
   * Requires authors to be loaded
   *
   * @returns {string}
   */
  get authorNameLF(): string {
    if (this.authors === undefined) {
      Logger.error(`[Book] authorNameLF: Cannot get authorNameLF because authors are not loaded`)
      return ''
    }

    // Last, First
    if (!this.authors.length) return ''
    return this.authors.map((au) => parseNameString.nameToLastFirst(au.name)).join(', ')
  }

  /**
   * Comma separated array of series with sequence
   * Requires series to be loaded
   *
   * @returns {string}
   */
  get seriesName(): string {
    if (this.series === undefined) {
      Logger.error(`[Book] seriesName: Cannot get seriesName because series are not loaded`)
      return ''
    }

    if (!this.series.length) return ''
    return this.series
      .map((se) => {
        const sequence = se.bookSeries?.sequence || ''
        if (!sequence) return se.name
        return `${se.name} #${sequence}`
      })
      .join(', ')
  }

  get includedAudioFiles(): AudioFileObject[] {
    return (this.audioFiles || []).filter((af) => !af.exclude)
  }

  get hasMediaFiles(): boolean {
    return !!this.hasAudioTracks || !!this.ebookFile
  }

  get hasAudioTracks(): boolean {
    return !!this.includedAudioFiles.length
  }

  /**
   * Supported mime types are sent from the web client and are retrieved using the browser Audio player "canPlayType" function.
   *
   * @param {string[]} supportedMimeTypes
   * @returns {boolean}
   */
  checkCanDirectPlay(supportedMimeTypes: string[]): boolean {
    if (!Array.isArray(supportedMimeTypes)) {
      Logger.error(`[Book] checkCanDirectPlay: supportedMimeTypes is not an array`, supportedMimeTypes)
      return false
    }
    return this.includedAudioFiles.every((af) => supportedMimeTypes.includes(af.mimeType))
  }

  /**
   * Get the track list to be used in client audio players
   * AudioTrack is the AudioFile with startOffset, contentUrl and title
   *
   * @param {string} libraryItemId
   * @returns {AudioTrack[]}
   */
  getTracklist(libraryItemId: string): AudioTrack[] {
    let startOffset = 0
    return this.includedAudioFiles.map((af) => {
      const track: any = structuredClone(af)
      track.title = af.metadata.filename
      track.startOffset = startOffset
      track.contentUrl = `/api/items/${libraryItemId}/file/${track.ino}`
      startOffset += track.duration
      return track
    })
  }

  /**
   *
   * @returns {ChapterObject[]}
   */
  getChapters(): ChapterObject[] {
    return structuredClone(this.chapters) || []
  }

  getPlaybackTitle(): string {
    return this.title
  }

  getPlaybackAuthor(): string {
    return this.authorName
  }

  getPlaybackDuration(): number {
    return this.duration
  }

  /**
   * Total file size of all audio files and ebook file
   *
   * @returns {number}
   */
  get size(): number {
    let total = 0
    ;(this.audioFiles || []).forEach((af) => (total += af.metadata.size))
    if (this.ebookFile) {
      total += this.ebookFile.metadata.size
    }
    return total
  }

  getAbsMetadataJson(): any {
    return {
      tags: this.tags || [],
      chapters: this.chapters?.map((c) => ({ ...c })) || [],
      title: this.title,
      subtitle: this.subtitle,
      authors: this.authors.map((a) => a.name),
      narrators: this.narrators,
      series: this.series.map((se) => {
        const sequence = se.bookSeries?.sequence || ''
        if (!sequence) return se.name
        return `${se.name} #${sequence}`
      }),
      genres: this.genres || [],
      publishedYear: this.publishedYear,
      publishedDate: this.publishedDate,
      publisher: this.publisher,
      description: this.description,
      isbn: this.isbn,
      asin: this.asin,
      language: this.language,
      explicit: !!this.explicit,
      abridged: !!this.abridged
    }
  }

  /**
   *
   * @param {Object} payload - old book object
   * @returns {Promise<boolean>}
   */
  async updateFromRequest(payload: any): Promise<boolean> {
    if (!payload) return false

    let hasUpdates = false

    if (payload.metadata) {
      const metadataStringKeys = ['title', 'subtitle', 'publishedYear', 'publishedDate', 'publisher', 'description', 'isbn', 'asin', 'language']
      metadataStringKeys.forEach((key) => {
        if (typeof payload.metadata[key] === 'number') {
          payload.metadata[key] = String(payload.metadata[key])
        }

        if ((typeof payload.metadata[key] === 'string' || payload.metadata[key] === null) && (this as any)[key] !== payload.metadata[key]) {
          // Sanitize description HTML
          if (key === 'description' && payload.metadata[key]) {
            const sanitizedDescription = htmlSanitizer.sanitize(payload.metadata[key])
            if (sanitizedDescription !== payload.metadata[key]) {
              Logger.debug(`[Book] "${this.title}" Sanitized description from "${payload.metadata[key]}" to "${sanitizedDescription}"`)
              payload.metadata[key] = sanitizedDescription
            }
          }

          ;(this as any)[key] = payload.metadata[key] || null

          if (key === 'title') {
            this.titleIgnorePrefix = getTitleIgnorePrefix(this.title)
          }

          hasUpdates = true
        }
      })
      if (payload.metadata.explicit !== undefined && this.explicit !== !!payload.metadata.explicit) {
        this.explicit = !!payload.metadata.explicit
        hasUpdates = true
      }
      if (payload.metadata.abridged !== undefined && this.abridged !== !!payload.metadata.abridged) {
        this.abridged = !!payload.metadata.abridged
        hasUpdates = true
      }
      const arrayOfStringsKeys = ['narrators', 'genres']
      arrayOfStringsKeys.forEach((key) => {
        if (Array.isArray(payload.metadata[key]) && !payload.metadata[key].some((item: any) => typeof item !== 'string') && JSON.stringify((this as any)[key]) !== JSON.stringify(payload.metadata[key])) {
          ;(this as any)[key] = payload.metadata[key]
          ;(this as any).changed(key, true)
          hasUpdates = true
        }
      })
    }

    if (Array.isArray(payload.tags) && !payload.tags.some((tag: any) => typeof tag !== 'string') && JSON.stringify(this.tags) !== JSON.stringify(payload.tags)) {
      this.tags = payload.tags
      this.changed('tags', true)
      hasUpdates = true
    }

    if (hasUpdates) {
      Logger.debug(`[Book] "${this.title}" changed keys:`, this.changed())
      await this.save()
    }

    return hasUpdates
  }

  /**
   * Creates or removes authors from the book using the author names from the request
   *
   * @param {string[]} authors
   * @param {string} libraryId
   * @returns {Promise<{authorsRemoved: import('./Author')[], authorsAdded: import('./Author')[]}>}
   */
  async updateAuthorsFromRequest(authors: string[], libraryId: string): Promise<{ authorsRemoved: Author[], authorsAdded: Author[] } | null> {
    if (!Array.isArray(authors)) return null

    if (!this.authors) {
      throw new Error(`[Book] Cannot update authors because authors are not loaded for book ${this.id}`)
    }

    const authorModel: any = (this as any).sequelize.models.author
    const bookAuthorModel: any = (this as any).sequelize.models.bookAuthor

    const authorsCleaned = authors.map((a) => a.toLowerCase()).filter((a) => a)
    const authorsRemoved = this.authors.filter((au) => !authorsCleaned.includes(au.name.toLowerCase()))
    const newAuthorNames = authors.filter((a) => !this.authors.some((au) => au.name.toLowerCase() === a.toLowerCase()))

    for (const author of authorsRemoved) {
      await bookAuthorModel.removeByIds(author.id, this.id)
      const numBooks = await bookAuthorModel.getCountForAuthor(author.id)
      if (numBooks > 0) {
        SocketAuthority.emitter('author_updated', author.toOldJSONExpanded(numBooks))
      }
      Logger.debug(`[Book] "${this.title}" Removed author "${author.name}"`)
      this.authors = this.authors.filter((au) => au.id !== author.id)
    }
    const authorsAdded: Author[] = []
    for (const authorName of newAuthorNames) {
      const { author, created } = await authorModel.findOrCreateByNameAndLibrary(authorName, libraryId)
      await bookAuthorModel.create({ bookId: this.id, authorId: author.id })
      if (created) {
        SocketAuthority.emitter('author_added', author.toOldJSON())
      } else {
        const numBooks = await bookAuthorModel.getCountForAuthor(author.id)
        SocketAuthority.emitter('author_updated', author.toOldJSONExpanded(numBooks))
      }
      Logger.debug(`[Book] "${this.title}" Added author "${author.name}"`)
      this.authors.push(author)
      authorsAdded.push(author)
    }

    return {
      authorsRemoved,
      authorsAdded
    }
  }

  /**
   * Creates or removes series from the book using the series names from the request.
   * Updates series sequence if it has changed.
   *
   * @param {{ name: string, sequence: string }[]} seriesObjects
   * @param {string} libraryId
   * @returns {Promise<{seriesRemoved: import('./Series')[], seriesAdded: import('./Series')[], hasUpdates: boolean}>}
   */
  async updateSeriesFromRequest(seriesObjects: { name: string, sequence: string }[], libraryId: string): Promise<{ seriesRemoved: Series[], seriesAdded: Series[], hasUpdates: boolean } | null> {
    if (!Array.isArray(seriesObjects) || seriesObjects.some((se) => !se.name || typeof se.name !== 'string')) return null

    if (!this.series) {
      throw new Error(`[Book] Cannot update series because series are not loaded for book ${this.id}`)
    }

    const seriesModel: any = (this as any).sequelize.models.series
    const bookSeriesModel: any = (this as any).sequelize.models.bookSeries

    const seriesNamesCleaned = seriesObjects.map((se) => se.name.toLowerCase())
    const seriesRemoved = this.series.filter((se) => !seriesNamesCleaned.includes(se.name.toLowerCase()))
    const seriesAdded: Series[] = []
    let hasUpdates = false
    for (const seriesObj of seriesObjects) {
      const seriesObjSequence = typeof seriesObj.sequence === 'string' ? seriesObj.sequence : null

      const existingSeries = this.series.find((se) => se.name.toLowerCase() === seriesObj.name.toLowerCase())
      if (existingSeries) {
        if (existingSeries.bookSeries.sequence !== seriesObjSequence) {
          existingSeries.bookSeries.sequence = seriesObjSequence!
          await (existingSeries.bookSeries as any).save()
          hasUpdates = true
          Logger.debug(`[Book] "${this.title}" Updated series "${existingSeries.name}" sequence ${seriesObjSequence}`)
        }
      } else {
        const series = await seriesModel.findOrCreateByNameAndLibrary(seriesObj.name, libraryId)
        series.bookSeries = await bookSeriesModel.create({ bookId: this.id, seriesId: series.id, sequence: seriesObjSequence })
        this.series.push(series)
        seriesAdded.push(series)
        hasUpdates = true
        Logger.debug(`[Book] "${this.title}" Added series "${series.name}"`)
      }
    }

    for (const series of seriesRemoved) {
      await bookSeriesModel.removeByIds(series.id, this.id)
      this.series = this.series.filter((se) => se.id !== series.id)
      Logger.debug(`[Book] "${this.title}" Removed series ${series.id}`)
      hasUpdates = true
    }

    return {
      seriesRemoved,
      seriesAdded,
      hasUpdates
    }
  }

  /**
   * Old model kept metadata in a separate object
   */
  oldMetadataToJSON(): any {
    const authors = (this.authors || []).map((au) => ({ id: au.id, name: au.name }))
    const series = (this.series || []).map((se) => ({ id: se.id, name: se.name, sequence: se.bookSeries?.sequence }))
    return {
      title: this.title,
      subtitle: this.subtitle,
      authors,
      narrators: [...(this.narrators || [])],
      series,
      genres: [...(this.genres || [])],
      publishedYear: this.publishedYear,
      publishedDate: this.publishedDate,
      publisher: this.publisher,
      description: this.description,
      isbn: this.isbn,
      asin: this.asin,
      language: this.language,
      explicit: this.explicit,
      abridged: this.abridged
    }
  }

  oldMetadataToJSONMinified(): any {
    return {
      title: this.title,
      titleIgnorePrefix: getTitlePrefixAtEnd(this.title),
      subtitle: this.subtitle,
      authorName: this.authorName,
      authorNameLF: this.authorNameLF,
      narratorName: (this.narrators || []).join(', '),
      seriesName: this.seriesName,
      genres: [...(this.genres || [])],
      publishedYear: this.publishedYear,
      publishedDate: this.publishedDate,
      publisher: this.publisher,
      description: this.description,
      isbn: this.isbn,
      asin: this.asin,
      language: this.language,
      explicit: this.explicit,
      abridged: this.abridged
    }
  }

  oldMetadataToJSONExpanded(): any {
    const oldMetadataJSON = this.oldMetadataToJSON()
    oldMetadataJSON.titleIgnorePrefix = getTitlePrefixAtEnd(this.title)
    oldMetadataJSON.authorName = this.authorName
    oldMetadataJSON.authorNameLF = this.authorNameLF
    oldMetadataJSON.narratorName = (this.narrators || []).join(', ')
    oldMetadataJSON.seriesName = this.seriesName
    oldMetadataJSON.descriptionPlain = this.description ? htmlSanitizer.stripAllTags(this.description) : null
    return oldMetadataJSON
  }

  /**
   * The old model stored a minified series and authors array with the book object.
   * Minified series is { id, name, sequence }
   * Minified author is { id, name }
   *
   * @param {string} libraryItemId
   */
  toOldJSON(libraryItemId: string): any {
    if (!libraryItemId) {
      throw new Error(`[Book] Cannot convert to old JSON because libraryItemId is not provided`)
    }
    if (!this.authors) {
      throw new Error(`[Book] Cannot convert to old JSON because authors are not loaded`)
    }
    if (!this.series) {
      throw new Error(`[Book] Cannot convert to old JSON because series are not loaded`)
    }

    return {
      id: this.id,
      libraryItemId: libraryItemId,
      metadata: this.oldMetadataToJSON(),
      coverPath: this.coverPath,
      tags: [...(this.tags || [])],
      audioFiles: structuredClone(this.audioFiles),
      chapters: structuredClone(this.chapters),
      ebookFile: structuredClone(this.ebookFile)
    }
  }

  /**
   * Minified book JSON for list/shelf endpoints.
   * `toOldJSONExpanded()` must be a strict superset: every key here must exist in expanded
   * with the same value semantics. Only additive changes to expanded; never remove or rename keys.
   */
  toOldJSONMinified(): any {
    if (!this.authors) {
      throw new Error(`[Book] Cannot convert to old JSON because authors are not loaded`)
    }
    if (!this.series) {
      throw new Error(`[Book] Cannot convert to old JSON because series are not loaded`)
    }

    return {
      id: this.id,
      metadata: this.oldMetadataToJSONMinified(),
      coverPath: this.coverPath,
      tags: [...(this.tags || [])],
      numTracks: this.includedAudioFiles.length,
      numAudioFiles: this.audioFiles?.length || 0,
      numChapters: this.chapters?.length || 0,
      duration: this.duration,
      size: this.size,
      ebookFormat: this.ebookFile?.ebookFormat
    }
  }

  /**
   * Expanded book JSON for item detail and socket events.
   * Must be a strict superset of `toOldJSONMinified()` — built by spreading minified, then adding expanded-only fields.
   *
   * @param {string} libraryItemId
   */
  toOldJSONExpanded(libraryItemId: string): any {
    if (!libraryItemId) {
      throw new Error(`[Book] Cannot convert to old JSON because libraryItemId is not provided`)
    }
    if (!this.authors) {
      throw new Error(`[Book] Cannot convert to old JSON because authors are not loaded`)
    }
    if (!this.series) {
      throw new Error(`[Book] Cannot convert to old JSON because series are not loaded`)
    }

    return {
      ...this.toOldJSONMinified(),
      libraryItemId,
      metadata: this.oldMetadataToJSONExpanded(),
      audioFiles: structuredClone(this.audioFiles),
      chapters: structuredClone(this.chapters),
      ebookFile: structuredClone(this.ebookFile),
      tracks: this.getTracklist(libraryItemId)
    }
  }
}

export default Book
module.exports = Book
