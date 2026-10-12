import { DataTypes, Model, Op } from 'sequelize'
const Logger = require('../Logger')
const SocketAuthority = require('../SocketAuthority')

export interface OldPlaylistJSON {
  id: string
  name: string
  libraryId: string
  userId: string
  description: string | null
  lastUpdate: number
  createdAt: number
  items?: any[]
}

class Playlist extends Model {
  declare id: string
  declare name: string
  declare description: string | null
  declare libraryId: string
  declare userId: string
  declare createdAt: Date
  declare updatedAt: Date

  // Expanded properties
  declare playlistMediaItems?: any[]

  /**
   * Get old playlists for user and library
   *
   * @param {string} userId
   * @param {string} libraryId
   * @async
   */
  static async getOldPlaylistsForUserAndLibrary(userId: string, libraryId: string): Promise<any[]> {
    if (!userId && !libraryId) return []

    const whereQuery: Record<string, any> = {}
    if (userId) {
      whereQuery.userId = userId
    }
    if (libraryId) {
      whereQuery.libraryId = libraryId
    }
    const playlistsExpanded: any[] = await this.findAll({
      where: whereQuery,
      include: {
        model: (this.sequelize as any).models.playlistMediaItem,
        include: [
          {
            model: (this.sequelize as any).models.book,
            include: [
              {
                model: (this.sequelize as any).models.libraryItem
              },
              {
                model: (this.sequelize as any).models.author,
                through: {
                  attributes: []
                }
              },
              {
                model: (this.sequelize as any).models.series,
                through: {
                  attributes: ['sequence']
                }
              }
            ]
          },
          {
            model: (this.sequelize as any).models.podcastEpisode,
            include: {
              model: (this.sequelize as any).models.podcast,
              include: (this.sequelize as any).models.libraryItem
            }
          }
        ]
      } as any,
      order: [['playlistMediaItems', 'order', 'ASC']]
    })

    // Sort by name asc
    playlistsExpanded.sort((a, b) => a.name.localeCompare(b.name))

    return playlistsExpanded.map((playlist) => playlist.toOldJSONExpanded())
  }

  /**
   * Get number of playlists for a user and library
   * @param {string} userId
   * @param {string} libraryId
   * @returns {Promise<number>}
   */
  static async getNumPlaylistsForUserAndLibrary(userId: string, libraryId: string): Promise<number> {
    return this.count({
      where: {
        userId,
        libraryId
      }
    })
  }

  /**
   * Get all playlists for mediaItemIds
   * @param {string[]} mediaItemIds
   * @returns {Promise<Playlist[]>}
   */
  static async getPlaylistsForMediaItemIds(mediaItemIds: string[]): Promise<Playlist[]> {
    if (!mediaItemIds?.length) return []

    const playlistMediaItemsExpanded: any[] = await (this.sequelize as any).models.playlistMediaItem.findAll({
      where: {
        mediaItemId: {
          [Op.in]: mediaItemIds
        }
      },
      include: [
        {
          model: (this.sequelize as any).models.playlist,
          include: {
            model: (this.sequelize as any).models.playlistMediaItem,
            include: [
              {
                model: (this.sequelize as any).models.book,
                include: (this.sequelize as any).models.libraryItem
              },
              {
                model: (this.sequelize as any).models.podcastEpisode,
                include: {
                  model: (this.sequelize as any).models.podcast,
                  include: (this.sequelize as any).models.libraryItem
                }
              }
            ]
          }
        }
      ],
      order: [['playlist', 'playlistMediaItems', 'order', 'ASC']]
    })

    const playlists: Playlist[] = []
    for (const playlistMediaItem of playlistMediaItemsExpanded) {
      const playlist = playlistMediaItem.playlist
      if (playlists.some((p) => p.id === playlist.id)) continue

      playlist.playlistMediaItems = playlist.playlistMediaItems.map((pmi: any) => {
        if (pmi.mediaItemType === 'book' && pmi.book !== undefined) {
          pmi.mediaItem = pmi.book
          pmi.dataValues.mediaItem = pmi.dataValues.book
        } else if (pmi.mediaItemType === 'podcastEpisode' && pmi.podcastEpisode !== undefined) {
          pmi.mediaItem = pmi.podcastEpisode
          pmi.dataValues.mediaItem = pmi.dataValues.podcastEpisode
        }
        delete pmi.book
        delete pmi.dataValues.book
        delete pmi.podcastEpisode
        delete pmi.dataValues.podcastEpisode
        return pmi
      })
      playlists.push(playlist)
    }
    return playlists
  }

  /**
   * Removes media items and re-orders playlists
   *
   * @param {string[]} mediaItemIds
   */
  static async removeMediaItemsFromPlaylists(mediaItemIds: string[]): Promise<void> {
    if (!mediaItemIds?.length) return

    const playlistsWithItem: any[] = await this.getPlaylistsForMediaItemIds(mediaItemIds)

    if (!playlistsWithItem.length) return

    for (const playlist of playlistsWithItem) {
      let numMediaItems = playlist.playlistMediaItems.length

      let order = 1
      // Remove items in playlist and re-order
      for (const playlistMediaItem of playlist.playlistMediaItems) {
        if (mediaItemIds.includes(playlistMediaItem.mediaItemId)) {
          await playlistMediaItem.destroy()
          numMediaItems--
        } else {
          if (playlistMediaItem.order !== order) {
            playlistMediaItem.update({
              order
            })
          }
          order++
        }
      }

      // If playlist is now empty then remove it
      const jsonExpanded = await playlist.getOldJsonExpanded()
      if (!numMediaItems) {
        Logger.info(`[ApiRouter] Playlist "${playlist.name}" has no more items - removing it`)
        await playlist.destroy()
        SocketAuthority.clientEmitter(playlist.userId, 'playlist_removed', jsonExpanded)
      } else {
        SocketAuthority.clientEmitter(playlist.userId, 'playlist_updated', jsonExpanded)
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
        description: DataTypes.TEXT
      },
      {
        sequelize,
        modelName: 'playlist'
      }
    )

    const { library, user } = sequelize.models
    library.hasMany(Playlist)
    Playlist.belongsTo(library)

    user.hasMany(Playlist, {
      onDelete: 'CASCADE'
    })
    Playlist.belongsTo(user)

    Playlist.addHook('afterFind', (findResult: any) => {
      if (!findResult) return

      if (!Array.isArray(findResult)) findResult = [findResult]

      for (const instance of findResult) {
        if (instance.playlistMediaItems?.length) {
          instance.playlistMediaItems = instance.playlistMediaItems.map((pmi: any) => {
            if (pmi.mediaItemType === 'book' && pmi.book !== undefined) {
              pmi.mediaItem = pmi.book
              pmi.dataValues.mediaItem = pmi.dataValues.book
            } else if (pmi.mediaItemType === 'podcastEpisode' && pmi.podcastEpisode !== undefined) {
              pmi.mediaItem = pmi.podcastEpisode
              pmi.dataValues.mediaItem = pmi.dataValues.podcastEpisode
            }
            // To prevent mistakes:
            delete pmi.book
            delete pmi.dataValues.book
            delete pmi.podcastEpisode
            delete pmi.dataValues.podcastEpisode
            return pmi
          })
        }
      }
    })
  }

  /**
   * Get all media items in playlist expanded with library item
   *
   * @returns {Promise<any[]>}
   */
  getMediaItemsExpandedWithLibraryItem(): Promise<any[]> {
    return (this as any).getPlaylistMediaItems({
      include: [
        {
          model: (this.sequelize as any).models.book,
          include: [
            {
              model: (this.sequelize as any).models.libraryItem
            },
            {
              model: (this.sequelize as any).models.author,
              through: {
                attributes: []
              }
            },
            {
              model: (this.sequelize as any).models.series,
              through: {
                attributes: ['sequence']
              }
            }
          ]
        },
        {
          model: (this.sequelize as any).models.podcastEpisode,
          include: {
            model: (this.sequelize as any).models.podcast,
            include: (this.sequelize as any).models.libraryItem
          }
        }
      ],
      order: [['order', 'ASC']]
    })
  }

  /**
   * Get playlists toOldJSONExpanded
   *
   * @async
   */
  async getOldJsonExpanded(): Promise<OldPlaylistJSON> {
    this.playlistMediaItems = await this.getMediaItemsExpandedWithLibraryItem()
    return this.toOldJSONExpanded()
  }

  /**
   * Old model used libraryItemId instead of bookId
   *
   * @param {string} libraryItemId
   * @param {string} [episodeId]
   */
  checkHasMediaItem(libraryItemId: string, episodeId?: string): boolean {
    if (!this.playlistMediaItems) {
      throw new Error('playlistMediaItems are required to check Playlist')
    }
    if (episodeId) {
      return this.playlistMediaItems.some((pmi: any) => pmi.mediaItemId === episodeId)
    }
    return this.playlistMediaItems.some((pmi: any) => pmi.mediaItem?.libraryItem?.id === libraryItemId)
  }

  toOldJSON(): OldPlaylistJSON {
    return {
      id: this.id,
      name: this.name,
      libraryId: this.libraryId,
      userId: this.userId,
      description: this.description,
      lastUpdate: this.updatedAt.valueOf(),
      createdAt: this.createdAt.valueOf()
    }
  }

  toOldJSONExpanded(): OldPlaylistJSON {
    if (!this.playlistMediaItems) {
      throw new Error('playlistMediaItems are required to expand Playlist')
    }

    const json = this.toOldJSON()
    json.items = this.playlistMediaItems.map((pmi: any) => {
      if (pmi.mediaItemType === 'book') {
        const libraryItem = pmi.mediaItem.libraryItem
        delete pmi.mediaItem.libraryItem
        libraryItem.media = pmi.mediaItem
        return {
          libraryItemId: libraryItem.id,
          libraryItem: libraryItem.toOldJSONExpanded()
        }
      }

      const libraryItem = pmi.mediaItem.podcast.libraryItem
      delete pmi.mediaItem.podcast.libraryItem
      libraryItem.media = pmi.mediaItem.podcast
      return {
        episodeId: pmi.mediaItemId,
        episode: pmi.mediaItem.toOldJSONExpanded(libraryItem.id),
        libraryItemId: libraryItem.id,
        libraryItem: libraryItem.toOldJSONMinified()
      }
    })

    return json
  }
}

export default Playlist
module.exports = Playlist
