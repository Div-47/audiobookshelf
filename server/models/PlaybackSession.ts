import { DataTypes, Model } from 'sequelize'
const oldPlaybackSession = require('../objects/PlaybackSession')

class PlaybackSession extends Model {
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: string
  declare displayTitle: string
  declare displayAuthor: string
  declare duration: number
  declare playMethod: number
  declare mediaPlayer: string
  declare startTime: number
  declare currentTime: number
  declare serverVersion: string | null
  declare coverPath: string | null
  declare timeListening: number
  declare mediaMetadata: Record<string, any>
  declare date: string
  declare dayOfWeek: string
  declare extraData: Record<string, any>
  declare userId: string
  declare deviceId: string | null
  declare libraryId: string
  declare updatedAt: Date
  declare createdAt: Date

  declare device?: any
  declare mediaItem?: any

  static async getOldPlaybackSessions(where: any = null): Promise<any[]> {
    const playbackSessions: any[] = await this.findAll({
      where,
      include: [
        {
          model: (this.sequelize as any).models.device
        }
      ]
    })
    return playbackSessions.map((session) => this.getOldPlaybackSession(session))
  }

  static async getById(sessionId: string): Promise<any | null> {
    const playbackSession: any = await this.findByPk(sessionId, {
      include: [
        {
          model: (this.sequelize as any).models.device
        }
      ]
    })
    if (!playbackSession) return null
    return this.getOldPlaybackSession(playbackSession)
  }

  static getOldPlaybackSession(playbackSessionExpanded: any): any {
    const isPodcastEpisode = playbackSessionExpanded.mediaItemType === 'podcastEpisode'

    return new oldPlaybackSession({
      id: playbackSessionExpanded.id,
      userId: playbackSessionExpanded.userId,
      libraryId: playbackSessionExpanded.libraryId,
      libraryItemId: playbackSessionExpanded.extraData?.libraryItemId || null,
      bookId: isPodcastEpisode ? null : playbackSessionExpanded.mediaItemId,
      episodeId: isPodcastEpisode ? playbackSessionExpanded.mediaItemId : null,
      mediaType: isPodcastEpisode ? 'podcast' : 'book',
      mediaMetadata: playbackSessionExpanded.mediaMetadata,
      chapters: null,
      displayTitle: playbackSessionExpanded.displayTitle,
      displayAuthor: playbackSessionExpanded.displayAuthor,
      coverPath: playbackSessionExpanded.coverPath,
      duration: playbackSessionExpanded.duration,
      playMethod: playbackSessionExpanded.playMethod,
      mediaPlayer: playbackSessionExpanded.mediaPlayer,
      deviceInfo: playbackSessionExpanded.device?.getOldDevice() || null,
      serverVersion: playbackSessionExpanded.serverVersion,
      date: playbackSessionExpanded.date,
      dayOfWeek: playbackSessionExpanded.dayOfWeek,
      timeListening: playbackSessionExpanded.timeListening,
      startTime: playbackSessionExpanded.startTime,
      currentTime: playbackSessionExpanded.currentTime,
      startedAt: playbackSessionExpanded.createdAt.valueOf(),
      updatedAt: playbackSessionExpanded.updatedAt.valueOf()
    })
  }

  static removeById(sessionId: string): Promise<number> {
    return this.destroy({
      where: {
        id: sessionId
      }
    })
  }

  static createFromOld(oldSession: any): Promise<any> {
    const playbackSession = this.getFromOld(oldSession)
    return this.upsert(playbackSession, {
      silent: true
    } as any)
  }

  static updateFromOld(oldSession: any): Promise<any> {
    const playbackSession = this.getFromOld(oldSession)
    return this.update(playbackSession, {
      where: {
        id: playbackSession.id
      },
      silent: true
    })
  }

  static getFromOld(oldSession: any): Record<string, any> {
    return {
      id: oldSession.id,
      mediaItemId: oldSession.episodeId || oldSession.bookId,
      mediaItemType: oldSession.episodeId ? 'podcastEpisode' : 'book',
      libraryId: oldSession.libraryId,
      displayTitle: oldSession.displayTitle,
      displayAuthor: oldSession.displayAuthor,
      duration: oldSession.duration,
      playMethod: oldSession.playMethod,
      mediaPlayer: oldSession.mediaPlayer,
      startTime: oldSession.startTime,
      currentTime: oldSession.currentTime,
      serverVersion: oldSession.serverVersion || null,
      createdAt: oldSession.startedAt,
      updatedAt: oldSession.updatedAt,
      userId: oldSession.userId,
      deviceId: oldSession.deviceInfo?.id || null,
      timeListening: oldSession.timeListening,
      coverPath: oldSession.coverPath,
      mediaMetadata: oldSession.mediaMetadata,
      date: oldSession.date,
      dayOfWeek: oldSession.dayOfWeek,
      extraData: {
        libraryItemId: oldSession.libraryItemId
      }
    }
  }

  getMediaItem(options?: any): Promise<any> {
    if (!this.mediaItemType) return Promise.resolve(null)
    const mixinMethodName = `get${(this.sequelize as any).uppercaseFirst(this.mediaItemType)}`
    return (this as any)[mixinMethodName](options)
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
        mediaItemId: DataTypes.UUID,
        mediaItemType: DataTypes.STRING,
        displayTitle: DataTypes.STRING,
        displayAuthor: DataTypes.STRING,
        duration: DataTypes.FLOAT,
        playMethod: DataTypes.INTEGER,
        mediaPlayer: DataTypes.STRING,
        startTime: DataTypes.FLOAT,
        currentTime: DataTypes.FLOAT,
        serverVersion: DataTypes.STRING,
        coverPath: DataTypes.STRING,
        timeListening: DataTypes.INTEGER,
        mediaMetadata: DataTypes.JSON,
        date: DataTypes.STRING,
        dayOfWeek: DataTypes.STRING,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'playbackSession'
      }
    )

    const { book, podcastEpisode, user, device, library } = sequelize.models

    user.hasMany(PlaybackSession)
    PlaybackSession.belongsTo(user)

    device.hasMany(PlaybackSession)
    PlaybackSession.belongsTo(device)

    library.hasMany(PlaybackSession)
    PlaybackSession.belongsTo(library)

    book.hasMany(PlaybackSession, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'book'
      }
    })
    PlaybackSession.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })

    podcastEpisode.hasOne(PlaybackSession, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'podcastEpisode'
      }
    })
    PlaybackSession.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })

    PlaybackSession.addHook('afterFind', (findResult: any) => {
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

export default PlaybackSession
module.exports = PlaybackSession
