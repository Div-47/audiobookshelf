import { DataTypes, Model, FindOptions } from 'sequelize'

export interface MediaItemShareForClient {
  id: string
  mediaItemId: string
  mediaItemType: string
  slug: string
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
  isDownloadable: boolean
}

class MediaItemShare extends Model {
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: string
  declare slug: string
  declare pash: string | null
  declare userId: string
  declare expiresAt: Date | null
  declare extraData: Record<string, any>
  declare createdAt: Date
  declare updatedAt: Date
  declare isDownloadable: boolean

  // Expanded properties
  declare mediaItem?: any

  toJSONForClient(): MediaItemShareForClient {
    return {
      id: this.id,
      mediaItemId: this.mediaItemId,
      mediaItemType: this.mediaItemType,
      slug: this.slug,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isDownloadable: this.isDownloadable
    }
  }

  /**
   * Expanded book that includes library settings
   *
   * @param {string} mediaItemId
   * @param {string} mediaItemType
   * @returns {Promise<any>}
   */
  static async getMediaItemsLibraryItem(mediaItemId: string, mediaItemType: string): Promise<any> {
    const libraryItemModel = (this.sequelize as any).models.libraryItem

    if (mediaItemType === 'book') {
      const libraryItem = await libraryItemModel.findOneExpanded({ mediaId: mediaItemId }, null, {
        model: (this.sequelize as any).models.library,
        attributes: ['settings']
      })

      return libraryItem
    }
    return null
  }

  /**
   *
   * @param {FindOptions} options
   * @returns {Promise<any>}
   */
  getMediaItem(options?: FindOptions): Promise<any> {
    if (!this.mediaItemType) return Promise.resolve(null)
    const mixinMethodName = `get${(this.sequelize as any).uppercaseFirst(this.mediaItemType)}`
    return (this as any)[mixinMethodName](options)
  }

  /**
   * Initialize model
   *
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
        mediaItemId: DataTypes.UUID,
        mediaItemType: DataTypes.STRING,
        slug: DataTypes.STRING,
        pash: DataTypes.STRING,
        expiresAt: DataTypes.DATE,
        extraData: DataTypes.JSON,
        isDownloadable: DataTypes.BOOLEAN
      },
      {
        sequelize,
        modelName: 'mediaItemShare'
      }
    )

    const { user, book, podcastEpisode } = sequelize.models

    user.hasMany(MediaItemShare)
    MediaItemShare.belongsTo(user)

    book.hasMany(MediaItemShare, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'book'
      }
    })
    MediaItemShare.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })

    podcastEpisode.hasOne(MediaItemShare, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'podcastEpisode'
      }
    })
    MediaItemShare.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })

    MediaItemShare.addHook('afterFind', (findResult: any) => {
      if (!findResult) return

      if (!Array.isArray(findResult)) findResult = [findResult]

      for (const instance of findResult) {
        if (instance.mediaItemType === 'book' && instance.book !== undefined) {
          instance.mediaItem = instance.book
          instance.dataValues.mediaItem = instance.dataValues.book
        } else if (instance.mediaItemType === 'podcastEpisode' && instance.podcastEpisode !== undefined) {
          instance.mediaItem = instance.podcastEpisode
          instance.dataValues.mediaItem = instance.dataValues.podcastEpisode
        }
        // To prevent mistakes:
        delete instance.book
        delete instance.dataValues.book
        delete instance.podcastEpisode
        delete instance.dataValues.podcastEpisode
      }
    })
  }
}

export default MediaItemShare
module.exports = MediaItemShare
