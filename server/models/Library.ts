import { DataTypes, Model } from 'sequelize'
const Logger = require('../Logger')

export interface LibrarySettingsObject {
  coverAspectRatio: number
  disableWatcher: boolean
  skipMatchingMediaWithAsin?: boolean
  skipMatchingMediaWithIsbn?: boolean
  autoScanCronExpression?: string | null
  audiobooksOnly?: boolean
  epubsAllowScriptedContent?: boolean
  hideSingleBookSeries?: boolean
  onlyShowLaterBooksInContinueSeries?: boolean
  podcastSearchRegion?: string
  metadataPrecedence?: string[]
  markAsFinishedTimeRemaining?: number
  markAsFinishedPercentComplete?: number | null
}

export interface OldLibraryJSON {
  id: string
  name: string
  folders: any[]
  displayOrder: number
  icon: string | null
  mediaType: string
  provider: string | null
  settings: Record<string, any>
  lastScan: number | null
  lastScanVersion: string | null
  createdAt: number
  lastUpdate: number
}

class Library extends Model {
  declare id: string
  declare name: string
  declare displayOrder: number
  declare icon: string | null
  declare mediaType: string
  declare provider: string | null
  declare lastScan: Date | null
  declare lastScanVersion: string | null
  declare settings: LibrarySettingsObject
  declare extraData: Record<string, any>
  declare createdAt: Date
  declare updatedAt: Date

  declare libraryFolders?: any[]

  static getDefaultLibrarySettingsForMediaType(mediaType: string): LibrarySettingsObject {
    if (mediaType === 'podcast') {
      return {
        coverAspectRatio: 1, // Square
        disableWatcher: false,
        autoScanCronExpression: null,
        podcastSearchRegion: 'us',
        markAsFinishedPercentComplete: null,
        markAsFinishedTimeRemaining: 10
      }
    } else {
      return {
        coverAspectRatio: 1, // Square
        disableWatcher: false,
        autoScanCronExpression: null,
        skipMatchingMediaWithAsin: false,
        skipMatchingMediaWithIsbn: false,
        audiobooksOnly: false,
        epubsAllowScriptedContent: false,
        hideSingleBookSeries: false,
        onlyShowLaterBooksInContinueSeries: false,
        metadataPrecedence: this.defaultMetadataPrecedence,
        markAsFinishedPercentComplete: null,
        markAsFinishedTimeRemaining: 10
      }
    }
  }

  static get defaultMetadataPrecedence(): string[] {
    return ['folderStructure', 'audioMetatags', 'nfoFile', 'txtFiles', 'opfFile', 'absMetadata']
  }

  static getAllWithFolders(): Promise<Library[]> {
    return this.findAll({
      include: (this.sequelize as any).models.libraryFolder,
      order: [['displayOrder', 'ASC']]
    })
  }

  static findByIdWithFolders(libraryId: string): Promise<Library | null> {
    return this.findByPk(libraryId, {
      include: (this.sequelize as any).models.libraryFolder
    })
  }

  /**
   * Get all library ids
   * @returns {Promise<string[]>} array of library ids
   */
  static async getAllLibraryIds(): Promise<string[]> {
    const libraries: any[] = await this.findAll({
      attributes: ['id', 'displayOrder'],
      order: [['displayOrder', 'ASC']]
    })
    return libraries.map((l) => l.id)
  }

  /**
   * Get the largest value in the displayOrder column
   * Used for setting a new libraries display order
   * @returns {Promise<number>}
   */
  static getMaxDisplayOrder(): Promise<number> {
    return (this.max('displayOrder') as Promise<number>) || Promise.resolve(0)
  }

  /**
   * Updates displayOrder to be sequential
   * Used after removing a library
   */
  static async resetDisplayOrder(): Promise<void> {
    const libraries: any[] = await this.findAll({
      order: [['displayOrder', 'ASC']]
    })
    for (let i = 0; i < libraries.length; i++) {
      const library = libraries[i]
      if (library.displayOrder !== i + 1) {
        Logger.debug(`[Library] Updating display order of library from ${library.displayOrder} to ${i + 1}`)
        await library.update({ displayOrder: i + 1 }).catch((error: any) => {
          Logger.error(`[Library] Failed to update library display order to ${i + 1}`, error)
        })
      }
    }
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
        name: DataTypes.STRING,
        displayOrder: DataTypes.INTEGER,
        icon: DataTypes.STRING,
        mediaType: DataTypes.STRING,
        provider: DataTypes.STRING,
        lastScan: DataTypes.DATE,
        lastScanVersion: DataTypes.STRING,
        settings: DataTypes.JSON,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'library'
      }
    )
  }

  get isPodcast(): boolean {
    return this.mediaType === 'podcast'
  }
  get isBook(): boolean {
    return this.mediaType === 'book'
  }
  get lastScanMetadataPrecedence(): string[] {
    return this.extraData?.lastScanMetadataPrecedence || []
  }

  get librarySettings(): LibrarySettingsObject {
    return this.settings || Library.getDefaultLibrarySettingsForMediaType(this.mediaType)
  }

  /**
   * TODO: Update to use new model
   */
  toOldJSON(): OldLibraryJSON {
    return {
      id: this.id,
      name: this.name,
      folders: (this.libraryFolders || []).map((f: any) => f.toOldJSON()),
      displayOrder: this.displayOrder,
      icon: this.icon,
      mediaType: this.mediaType,
      provider: this.provider,
      settings: {
        ...this.settings
      },
      lastScan: this.lastScan?.valueOf() || null,
      lastScanVersion: this.lastScanVersion,
      createdAt: this.createdAt.valueOf(),
      lastUpdate: this.updatedAt.valueOf()
    }
  }
}

export default Library
module.exports = Library
