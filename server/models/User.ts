import { DataTypes, Model } from 'sequelize'
const uuidv4 = require('uuid').v4
const sequelize = require('sequelize')
const { LRUCache } = require('lru-cache')

const Logger = require('../Logger')
const SocketAuthority = require('../SocketAuthority')
const { isNullOrNaN } = require('../utils')
const TokenManager = require('../auth/TokenManager')

export interface AudioBookmarkObject {
  libraryItemId: string
  title: string
  time: number
  createdAt: number
}

export interface ProgressUpdatePayload {
  libraryItemId: string
  episodeId?: string
  duration?: number
  progress?: number
  currentTime?: number
  isFinished?: boolean
  hideFromContinueListening?: boolean
  ebookLocation?: string
  ebookProgress?: number
  finishedAt?: number | string | Date | null
  lastUpdate?: number | string | Date
  markAsFinishedTimeRemaining?: number | string
  markAsFinishedPercentComplete?: number | string
  createdAt?: number | string | Date
  [key: string]: any
}

export interface UserPermissions {
  download: boolean
  update: boolean
  delete: boolean
  upload: boolean
  createEreader: boolean
  accessAllLibraries: boolean
  accessAllTags: boolean
  accessExplicitContent: boolean
  selectedTagsNotAccessible: boolean
  librariesAccessible: string[]
  itemTagsSelected: string[]
}

class UserCache {
  cache: any

  constructor() {
    this.cache = new LRUCache({ max: 100 })
  }

  getById(id: string): any {
    const user = this.cache.get(id)
    return user
  }

  getByEmail(email: string): any {
    const user = this.cache.find((u: any) => u.email === email)
    return user
  }

  getByUsername(username: string): any {
    const user = this.cache.find((u: any) => u.username === username)
    return user
  }

  getByOldId(oldUserId: string): any {
    const user = this.cache.find((u: any) => u.extraData?.oldUserId === oldUserId)
    return user
  }

  getByOpenIDSub(sub: string): any {
    const user = this.cache.find((u: any) => u.extraData?.authOpenIDSub === sub)
    return user
  }

  set(user: any): void {
    user.fromCache = true
    this.cache.set(user.id, user)
  }

  delete(userId: string): void {
    this.cache.delete(userId)
  }

  maybeInvalidate(user: any): void {
    if (!user.fromCache) this.delete(user.id)
  }
}

const userCache = new UserCache()

class User extends Model {
  declare id: string
  declare username: string
  declare email: string | null
  declare pash: string | null
  declare type: string
  declare token: string
  declare isActive: boolean
  declare isLocked: boolean
  declare lastSeen: Date | null
  declare permissions: UserPermissions
  declare bookmarks: AudioBookmarkObject[]
  declare extraData: Record<string, any>
  declare createdAt: Date
  declare updatedAt: Date

  // Runtime flags and associations
  declare fromCache?: boolean
  declare isOldToken?: boolean
  declare mediaProgresses?: any[]

  // Excludes "root" since their can only be 1 root user
  static accountTypes = ['admin', 'user', 'guest']

  /**
   * List of expected permission properties from the client
   * Only used for OpenID
   */
  static permissionMapping: Record<string, string> = {
    canDownload: 'download',
    canUpload: 'upload',
    canDelete: 'delete',
    canUpdate: 'update',
    canAccessExplicitContent: 'accessExplicitContent',
    canAccessAllLibraries: 'accessAllLibraries',
    canAccessAllTags: 'accessAllTags',
    canCreateEReader: 'createEreader',
    tagsAreDenylist: 'selectedTagsNotAccessible',
    // Direct mapping for array-based permissions
    allowedLibraries: 'librariesAccessible',
    allowedTags: 'itemTagsSelected'
  }

  /**
   * Get a sample to show how a JSON for updatePermissionsFromExternalJSON should look like
   * Only used for OpenID
   *
   * @returns {string} JSON string
   */
  static getSampleAbsPermissions(): string {
    // Start with a template object where all permissions are false for simplicity
    const samplePermissions = Object.keys(User.permissionMapping).reduce((acc: Record<string, any>, key: string) => {
      // For array-based permissions, provide a sample array
      if (key === 'allowedLibraries') {
        acc[key] = [`5406ba8a-16e1-451d-96d7-4931b0a0d966`, `918fd848-7c1d-4a02-818a-847435a879ca`]
      } else if (key === 'allowedTags') {
        acc[key] = [`ExampleTag`, `AnotherTag`, `ThirdTag`]
      } else {
        acc[key] = false
      }
      return acc
    }, {})

    return JSON.stringify(samplePermissions, null, 2) // Pretty print the JSON
  }

  static getDefaultPermissionsForUserType(type: string): UserPermissions {
    return {
      download: true,
      update: type === 'root' || type === 'admin',
      delete: type === 'root',
      upload: type === 'root' || type === 'admin',
      createEreader: type === 'root' || type === 'admin',
      accessAllLibraries: true,
      accessAllTags: true,
      accessExplicitContent: type === 'root' || type === 'admin',
      selectedTagsNotAccessible: false,
      librariesAccessible: [],
      itemTagsSelected: []
    }
  }

  /**
   * Create root user
   * @param {string} username
   * @param {string} pash
   * @param {any} auth
   * @returns {Promise<User>}
   */
  static async createRootUser(username: string, pash: string, auth: any): Promise<User> {
    const userId = uuidv4()

    const token = auth.generateAccessToken({ id: userId, username })

    const newUser = {
      id: userId,
      type: 'root',
      username,
      pash,
      token,
      isActive: true,
      permissions: this.getDefaultPermissionsForUserType('root'),
      bookmarks: [],
      extraData: {
        seriesHideFromContinueListening: []
      }
    }
    return this.create(newUser)
  }

  /**
   * Finds an existing user by OpenID subject identifier, or by email/username based on server settings
   * Returns null if no user is found
   *
   * @param {Object} userinfo
   * @returns {Promise<User|{error: string}|null>}
   */
  static async findUserFromOpenIdUserInfo(userinfo: any): Promise<User | { error: string } | null> {
    let user = await this.getUserByOpenIDSub(userinfo.sub)

    // Matched by sub
    if (user) {
      Logger.debug(`[User] openid: User found by sub "${userinfo.sub}"`)
      return user
    }

    const serverSettings = (global as any).ServerSettings || {}

    // Match existing user by email
    if (serverSettings.authOpenIDMatchExistingBy === 'email') {
      if (userinfo.email) {
        // Only disallow when email_verified explicitly set to false (allow both if not set or true)
        if (userinfo.email_verified === false) {
          Logger.warn(`[User] openid: User not found and email "${userinfo.email}" is not verified`)
          return {
            error: 'Email not verified'
          }
        } else {
          Logger.info(`[User] openid: User not found, checking existing with email "${userinfo.email}"`)
          user = await this.getUserByEmail(userinfo.email)

          if (user?.authOpenIDSub) {
            Logger.warn(`[User] openid: User found with email "${userinfo.email}" but is already matched with sub "${user.authOpenIDSub}"`)
            // User is linked to a different OpenID subject; do not proceed.
            return {
              error: 'User already linked to a different OpenID subject'
            }
          }
        }
      } else {
        Logger.warn(`[User] openid: User not found and no email in userinfo`)
        // We deny login, because if the admin whishes to match email, it makes sense to require it
        return {
          error: 'No email in userinfo'
        }
      }
    }
    // Match existing user by username
    else if (serverSettings.authOpenIDMatchExistingBy === 'username') {
      let username: string | undefined

      if (userinfo.preferred_username) {
        Logger.info(`[User] openid: User not found, checking existing with userinfo.preferred_username "${userinfo.preferred_username}"`)
        username = userinfo.preferred_username
      } else if (userinfo.username) {
        Logger.info(`[User] openid: User not found, checking existing with userinfo.username "${userinfo.username}"`)
        username = userinfo.username
      } else {
        Logger.warn(`[User] openid: User not found and neither preferred_username nor username in userinfo`)
        return {
          error: 'No username in userinfo'
        }
      }

      user = await this.getUserByUsername(username!)

      if (user?.authOpenIDSub) {
        Logger.warn(`[User] openid: User found with username "${username}" but is already matched with sub "${user.authOpenIDSub}"`)
        // User is linked to a different OpenID subject; do not proceed.
        return {
          error: 'User already linked to a different OpenID subject'
        }
      }
    }

    if (!user) {
      return null
    }

    // Found existing user via email or username
    if (!user.isActive) {
      Logger.warn(`[User] openid: User found but is not active`)
      return user
    }

    // Update user with OpenID sub
    if (!user.extraData) user.extraData = {}
    user.extraData.authOpenIDSub = userinfo.sub
    user.changed('extraData', true)
    await user.save()

    Logger.debug(`[User] openid: User found by email/username`)
    return user
  }

  /**
   * Create user from openid userinfo
   * @param {Object} userinfo
   * @returns {Promise<User|null>}
   */
  static async createUserFromOpenIdUserInfo(userinfo: any): Promise<User | null> {
    const userId = uuidv4()
    // TODO: Ensure username is unique?
    const username = userinfo.preferred_username || userinfo.name || userinfo.sub
    const email = userinfo.email && userinfo.email_verified ? userinfo.email : null

    const token = TokenManager.generateAccessToken({ id: userId, username })

    const newUser = {
      id: userId,
      type: 'user',
      username,
      email,
      pash: null,
      token,
      isActive: true,
      permissions: this.getDefaultPermissionsForUserType('user'),
      bookmarks: [],
      extraData: {
        authOpenIDSub: userinfo.sub,
        seriesHideFromContinueListening: []
      }
    }
    const user: any = await this.create(newUser)

    if (user) {
      SocketAuthority.adminEmitter('user_added', user.toOldJSONForBrowser())
      return user
    }
    return null
  }

  /**
   * Get user by username case insensitive
   * @param {string} username
   * @returns {Promise<User|null>}
   */
  static async getUserByUsername(username: string): Promise<User | null> {
    if (!username) return null

    const cachedUser = userCache.getByUsername(username)
    if (cachedUser) return cachedUser

    const user: any = await this.findOne({
      where: sequelize.where(sequelize.fn('lower', sequelize.col('username')), username.toLowerCase()),
      include: (this.sequelize as any).models.mediaProgress
    })

    if (user) userCache.set(user)

    return user
  }

  /**
   * Get user by email case insensitive
   * @param {string} email
   * @returns {Promise<User|null>}
   */
  static async getUserByEmail(email: string): Promise<User | null> {
    if (!email) return null

    const cachedUser = userCache.getByEmail(email)
    if (cachedUser) return cachedUser

    const user: any = await this.findOne({
      where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), email.toLowerCase()),
      include: (this.sequelize as any).models.mediaProgress
    })

    if (user) userCache.set(user)

    return user
  }

  /**
   * Get user by id
   * @param {string} userId
   * @returns {Promise<User|null>}
   */
  static async getUserById(userId: string): Promise<User | null> {
    if (!userId) return null

    const cachedUser = userCache.getById(userId)
    if (cachedUser) return cachedUser

    const user: any = await this.findByPk(userId, {
      include: (this.sequelize as any).models.mediaProgress
    })

    if (user) userCache.set(user)

    return user
  }

  /**
   * Get user by id or old id
   * JWT tokens generated before 2.3.0 used old user ids
   *
   * @param {string} userId
   * @returns {Promise<User|null>}
   */
  static async getUserByIdOrOldId(userId: string): Promise<User | null> {
    if (!userId) return null
    const cachedUser = userCache.getById(userId) || userCache.getByOldId(userId)
    if (cachedUser) return cachedUser

    const user: any = await this.findOne({
      where: {
        [sequelize.Op.or]: [{ id: userId }, { 'extraData.oldUserId': userId }]
      },
      include: (this.sequelize as any).models.mediaProgress
    })

    if (user) userCache.set(user)

    return user
  }

  /**
   * Get user by openid sub
   * @param {string} sub
   * @returns {Promise<User|null>}
   */
  static async getUserByOpenIDSub(sub: string): Promise<User | null> {
    if (!sub) return null

    const cachedUser = userCache.getByOpenIDSub(sub)
    if (cachedUser) return cachedUser

    const user: any = await this.findOne({
      where: sequelize.where(sequelize.literal(`extraData->>"authOpenIDSub"`), sub),
      include: (this.sequelize as any).models.mediaProgress
    })

    if (user) userCache.set(user)

    return user
  }

  /**
   * Get array of user id and username
   * @returns {Promise<Array<{ id: string, username: string }>>}
   */
  static async getMinifiedUserObjects(): Promise<Array<{ id: string; username: string }>> {
    const users: any[] = await this.findAll({
      attributes: ['id', 'username']
    })
    return users.map((u) => {
      return {
        id: u.id,
        username: u.username
      }
    })
  }

  /**
   * Return true if root user exists
   * @returns {Promise<boolean>}
   */
  static async getHasRootUser(): Promise<boolean> {
    const count = await this.count({
      where: {
        type: 'root'
      }
    })
    return count > 0
  }

  /**
   * Check if user exists with username
   * @param {string} username
   * @returns {Promise<boolean>}
   */
  static async checkUserExistsWithUsername(username: string): Promise<boolean> {
    const count = await this.count({
      where: {
        username
      }
    })
    return count > 0
  }

  static mediaProgressRemoved(mediaProgress: any): void {
    const cachedUser = userCache.getById(mediaProgress.userId)
    if (cachedUser) {
      Logger.debug(`[User] mediaProgressRemoved: ${mediaProgress.id} from user ${cachedUser.id}`)
      if (Array.isArray(cachedUser.mediaProgresses)) {
        cachedUser.mediaProgresses = cachedUser.mediaProgresses.filter((mp: any) => mp.id !== mediaProgress.id)
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
        username: DataTypes.STRING,
        email: DataTypes.STRING,
        pash: DataTypes.STRING,
        type: DataTypes.STRING,
        token: DataTypes.STRING,
        isActive: {
          type: DataTypes.BOOLEAN,
          defaultValue: false
        },
        isLocked: {
          type: DataTypes.BOOLEAN,
          defaultValue: false
        },
        lastSeen: DataTypes.DATE,
        permissions: DataTypes.JSON,
        bookmarks: DataTypes.JSON,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'user',
        hooks: {
          beforeDestroy(user: any) {
            if (user.type === 'root') {
              throw new Error('Root user cannot be deleted')
            }
          }
        }
      }
    )
  }

  get isRoot(): boolean {
    return this.type === 'root'
  }
  get isAdminOrUp(): boolean {
    return this.isRoot || this.type === 'admin'
  }
  get isUser(): boolean {
    return this.type === 'user'
  }
  get isGuest(): boolean {
    return this.type === 'guest'
  }
  get canAccessExplicitContent(): boolean {
    return !!this.permissions?.accessExplicitContent && this.isActive
  }
  get canDelete(): boolean {
    return !!this.permissions?.delete && this.isActive
  }
  get canUpdate(): boolean {
    return !!this.permissions?.update && this.isActive
  }
  get canDownload(): boolean {
    return !!this.permissions?.download && this.isActive
  }
  get canUpload(): boolean {
    return !!this.permissions?.upload && this.isActive
  }
  get authOpenIDSub(): string | null {
    return this.extraData?.authOpenIDSub || null
  }

  /**
   * User data for clients
   * Emitted on socket events user_online, user_offline and user_stream_update
   *
   * @param {any[]} sessions
   * @returns
   */
  toJSONForPublic(sessions?: any[]): Record<string, any> {
    const session = sessions?.find((s: any) => s.userId === this.id)?.toJSONForClient() || null
    return {
      id: this.id,
      username: this.username,
      type: this.type,
      session,
      lastSeen: this.lastSeen?.valueOf() || null,
      createdAt: this.createdAt.valueOf()
    }
  }

  /**
   * User data for browser using old model
   *
   * @param {boolean} [hideRootToken=false]
   * @param {boolean} [minimal=false]
   * @returns
   */
  toOldJSONForBrowser(hideRootToken = false, minimal = false): Record<string, any> {
    const seriesHideFromContinueListening = this.extraData?.seriesHideFromContinueListening || []
    const librariesAccessible = this.permissions?.librariesAccessible || []
    const itemTagsSelected = this.permissions?.itemTagsSelected || []
    const permissions: Record<string, any> = { ...this.permissions }
    delete permissions.librariesAccessible
    delete permissions.itemTagsSelected

    const json: Record<string, any> = {
      id: this.id,
      username: this.username,
      email: this.email,
      type: this.type,
      // TODO: Old non-expiring token
      token: this.type === 'root' && hideRootToken ? '' : this.token,
      // TODO: Temporary flag not saved in db that is set in Auth.js jwtAuthCheck
      // Necessary to detect apps using old tokens that no longer match the old token stored on the user
      isOldToken: this.isOldToken,
      mediaProgress: this.mediaProgresses?.map((mp: any) => mp.getOldMediaProgress()) || [],
      seriesHideFromContinueListening: [...seriesHideFromContinueListening],
      bookmarks: this.bookmarks?.map((b: any) => ({ ...b })) || [],
      isActive: this.isActive,
      isLocked: this.isLocked,
      lastSeen: this.lastSeen?.valueOf() || null,
      createdAt: this.createdAt.valueOf(),
      permissions: permissions,
      librariesAccessible: [...librariesAccessible],
      itemTagsSelected: [...itemTagsSelected],
      hasOpenIDLink: !!this.authOpenIDSub
    }
    if (minimal) {
      delete json.mediaProgress
      delete json.bookmarks
    }
    return json
  }

  /**
   * Check user has access to library
   *
   * @param {string} libraryId
   * @returns {boolean}
   */
  checkCanAccessLibrary(libraryId: string): boolean {
    if (this.permissions?.accessAllLibraries) return true
    if (!this.permissions?.librariesAccessible) return false
    return this.permissions.librariesAccessible.includes(libraryId)
  }

  /**
   * Check user has access to library item with tags
   *
   * @param {string[]} tags
   * @returns {boolean}
   */
  checkCanAccessLibraryItemWithTags(tags: string[]): boolean {
    if (this.permissions.accessAllTags) return true
    const itemTagsSelected = this.permissions?.itemTagsSelected || []
    if (this.permissions.selectedTagsNotAccessible) {
      if (!tags?.length) return true
      return tags.every((tag) => !itemTagsSelected?.includes(tag))
    }
    if (!tags?.length) return false
    return itemTagsSelected.some((tag) => tags.includes(tag))
  }

  /**
   * Check user can access library item
   *
   * @param {any} libraryItem
   * @returns {boolean}
   */
  checkCanAccessLibraryItem(libraryItem: any): boolean {
    if (!this.checkCanAccessLibrary(libraryItem.libraryId)) return false

    const libraryItemExplicit = !!libraryItem.media?.explicit || !!libraryItem.media?.metadata?.explicit

    if (libraryItemExplicit && !this.canAccessExplicitContent) return false

    return this.checkCanAccessLibraryItemWithTags(libraryItem.media?.tags)
  }

  /**
   * Get first available library id for user
   *
   * @param {string[]} libraryIds
   * @returns {string|null}
   */
  getDefaultLibraryId(libraryIds: string[]): string | null {
    // Libraries should already be in ascending display order, find first accessible
    return libraryIds.find((lid) => this.checkCanAccessLibrary(lid)) || null
  }

  /**
   * Get media progress by media item id
   *
   * @param {string} mediaItemId
   * @returns {any|null}
   */
  getMediaProgress(mediaItemId: string): any | null {
    if (!this.mediaProgresses?.length) return null
    return this.mediaProgresses.find((mp: any) => mp.mediaItemId === mediaItemId) || null
  }

  /**
   * Get old media progress
   * TODO: Update to new model
   *
   * @param {string} libraryItemId
   * @param {string|null} [episodeId]
   * @returns {any|null}
   */
  getOldMediaProgress(libraryItemId: string, episodeId: string | null = null): any | null {
    const mediaProgress = this.mediaProgresses?.find((mp: any) => {
      if (episodeId && mp.mediaItemId !== episodeId) return false
      return mp.extraData?.libraryItemId === libraryItemId
    })
    return mediaProgress?.getOldMediaProgress() || null
  }

  /**
   * TODO: Uses old model and should account for the different between ebook/audiobook progress
   *
   * @param {ProgressUpdatePayload} progressPayload
   * @returns {Promise<{ mediaProgress: any, error?: string, statusCode?: number }>}
   */
  async createUpdateMediaProgressFromPayload(progressPayload: ProgressUpdatePayload): Promise<{ mediaProgress: any; error?: string; statusCode?: number }> {
    let mediaProgress: any = null
    let mediaItemId: string | null = null
    let podcastId: string | null = null

    const models = (this.sequelize as any).models

    if (progressPayload.episodeId) {
      const podcastEpisode = await models.podcastEpisode.findByPk(progressPayload.episodeId, {
        attributes: ['id', 'podcastId'],
        include: [
          {
            model: models.mediaProgress,
            where: { userId: this.id },
            required: false
          },
          {
            model: models.podcast,
            attributes: ['id', 'title'],
            include: {
              model: models.libraryItem,
              attributes: ['id']
            }
          }
        ]
      })
      if (!podcastEpisode) {
        Logger.error(`[User] createUpdateMediaProgress: episode ${progressPayload.episodeId} not found`)
        return {
          mediaProgress: null,
          error: 'Episode not found',
          statusCode: 404
        }
      }
      mediaItemId = podcastEpisode.id
      mediaProgress = podcastEpisode.mediaProgresses?.[0]
      podcastId = podcastEpisode.podcastId
    } else {
      const libraryItem = await models.libraryItem.findByPk(progressPayload.libraryItemId, {
        attributes: ['id', 'mediaId', 'mediaType'],
        include: {
          model: models.book,
          attributes: ['id', 'title'],
          required: false,
          include: {
            model: models.mediaProgress,
            where: { userId: this.id },
            required: false
          }
        }
      })
      if (!libraryItem) {
        Logger.error(`[User] createUpdateMediaProgress: library item ${progressPayload.libraryItemId} not found`)
        return {
          mediaProgress: null,
          error: 'Library item not found',
          statusCode: 404
        }
      } else if (libraryItem.mediaType !== 'book') {
        Logger.error(`[User] createUpdateMediaProgress: library item ${progressPayload.libraryItemId} is not a book`)
        return {
          mediaProgress: null,
          error: 'Library item is not a book',
          statusCode: 400
        }
      }

      mediaItemId = libraryItem.media.id
      mediaProgress = libraryItem.media.mediaProgresses?.[0]
    }

    if (!Array.isArray(this.mediaProgresses)) {
      this.mediaProgresses = []
    }

    if (mediaProgress) {
      mediaProgress = await mediaProgress.applyProgressUpdate(progressPayload)
      this.mediaProgresses = this.mediaProgresses.map((mp: any) => (mp.id === mediaProgress.id ? mediaProgress : mp))
    } else {
      const newMediaProgressPayload: Record<string, any> = {
        userId: this.id,
        mediaItemId,
        podcastId,
        mediaItemType: progressPayload.episodeId ? 'podcastEpisode' : 'book',
        duration: isNullOrNaN(progressPayload.duration) ? 0 : Number(progressPayload.duration),
        currentTime: isNullOrNaN(progressPayload.currentTime) ? 0 : Number(progressPayload.currentTime),
        isFinished: !!progressPayload.isFinished,
        hideFromContinueListening: !!progressPayload.hideFromContinueListening,
        ebookLocation: progressPayload.ebookLocation || null,
        ebookProgress: isNullOrNaN(progressPayload.ebookProgress) ? 0 : Number(progressPayload.ebookProgress),
        finishedAt: progressPayload.finishedAt ? new Date(progressPayload.finishedAt) : null,
        createdAt: progressPayload.createdAt ? new Date(progressPayload.createdAt) : new Date(),
        extraData: {
          libraryItemId: progressPayload.libraryItemId,
          progress: isNullOrNaN(progressPayload.progress) ? 0 : Number(progressPayload.progress)
        }
      }
      if (newMediaProgressPayload.isFinished) {
        newMediaProgressPayload.finishedAt = newMediaProgressPayload.finishedAt || new Date()
        newMediaProgressPayload.extraData.progress = 1
      } else {
        newMediaProgressPayload.finishedAt = null
      }
      mediaProgress = await models.mediaProgress.create(newMediaProgressPayload)
      this.mediaProgresses.push(mediaProgress)
    }
    userCache.maybeInvalidate(this)
    return {
      mediaProgress
    }
  }

  /**
   * Find bookmark
   * TODO: Bookmarks should use mediaItemId instead of libraryItemId to support podcast episodes
   *
   * @param {string} libraryItemId
   * @param {number} time
   * @returns {AudioBookmarkObject|null}
   */
  findBookmark(libraryItemId: string, time: number): AudioBookmarkObject | null {
    if (!Array.isArray(this.bookmarks)) return null
    return this.bookmarks.find((bm: any) => bm.libraryItemId === libraryItemId && bm.time == time) || null
  }

  /**
   * Create bookmark
   *
   * @param {string} libraryItemId
   * @param {number} time
   * @param {string} title
   * @returns {Promise<AudioBookmarkObject>}
   */
  async createBookmark(libraryItemId: string, time: number, title: string): Promise<AudioBookmarkObject> {
    if (!Array.isArray(this.bookmarks)) {
      this.bookmarks = []
    }
    const existingBookmark = this.findBookmark(libraryItemId, time)
    if (existingBookmark) {
      Logger.warn('[User] Create Bookmark already exists for this time')
      if (existingBookmark.title !== title) {
        existingBookmark.title = title
        this.changed('bookmarks', true)
        await this.save()
      }
      return existingBookmark
    }

    const newBookmark: AudioBookmarkObject = {
      libraryItemId,
      time,
      title,
      createdAt: Date.now()
    }
    this.bookmarks.push(newBookmark)
    this.changed('bookmarks', true)
    await this.save()
    return newBookmark
  }

  /**
   * Update bookmark
   *
   * @param {string} libraryItemId
   * @param {number} time
   * @param {string} title
   * @returns {Promise<AudioBookmarkObject|null>}
   */
  async updateBookmark(libraryItemId: string, time: number, title: string): Promise<AudioBookmarkObject | null> {
    const bookmark = this.findBookmark(libraryItemId, time)
    if (!bookmark) {
      Logger.error(`[User] updateBookmark not found`)
      return null
    }
    bookmark.title = title
    this.changed('bookmarks', true)
    await this.save()
    return bookmark
  }

  /**
   * Remove bookmark
   *
   * @param {string} libraryItemId
   * @param {number} time
   * @returns {Promise<boolean>} - true if bookmark was removed
   */
  async removeBookmark(libraryItemId: string, time: number): Promise<boolean> {
    if (!this.findBookmark(libraryItemId, time)) {
      Logger.error(`[User] removeBookmark not found`)
      return false
    }
    this.bookmarks = this.bookmarks.filter((bm: any) => bm.libraryItemId !== libraryItemId || bm.time !== time)
    this.changed('bookmarks', true)
    await this.save()
    return true
  }

  async addSeriesToHideFromContinueListening(seriesId: string): Promise<boolean> {
    if (!this.extraData) this.extraData = {}
    const seriesHideFromContinueListening: string[] = this.extraData.seriesHideFromContinueListening || []
    if (seriesHideFromContinueListening.includes(seriesId)) return false
    seriesHideFromContinueListening.push(seriesId)
    this.extraData.seriesHideFromContinueListening = seriesHideFromContinueListening
    this.changed('extraData', true)
    await this.save()
    return true
  }

  async removeSeriesFromHideFromContinueListening(seriesId: string): Promise<boolean> {
    if (!this.extraData) this.extraData = {}
    let seriesHideFromContinueListening: string[] = this.extraData.seriesHideFromContinueListening || []
    if (!seriesHideFromContinueListening.includes(seriesId)) return false
    seriesHideFromContinueListening = seriesHideFromContinueListening.filter((sid) => sid !== seriesId)
    this.extraData.seriesHideFromContinueListening = seriesHideFromContinueListening
    this.changed('extraData', true)
    await this.save()
    return true
  }

  /**
   * Update user permissions from external JSON
   *
   * @param {Record<string, any>} absPermissions JSON containing user permissions
   * @returns {Promise<boolean>} true if updates were made
   */
  async updatePermissionsFromExternalJSON(absPermissions: Record<string, any>): Promise<boolean> {
    if (!this.permissions) this.permissions = {} as UserPermissions
    let hasUpdates = false

    // Map the boolean permissions from absPermissions
    Object.keys(absPermissions).forEach((absKey) => {
      const userPermKey = User.permissionMapping[absKey]
      if (!userPermKey) {
        throw new Error(`Unexpected permission property: ${absKey}`)
      }

      if (!['librariesAccessible', 'itemTagsSelected'].includes(userPermKey)) {
        if ((this.permissions as any)[userPermKey] !== !!absPermissions[absKey]) {
          (this.permissions as any)[userPermKey] = !!absPermissions[absKey]
          hasUpdates = true
        }
      }
    })

    // Handle allowedLibraries
    const librariesAccessible: string[] = this.permissions.librariesAccessible || []
    if (this.permissions.accessAllLibraries) {
      if (librariesAccessible.length) {
        this.permissions.librariesAccessible = []
        hasUpdates = true
      }
    } else if (absPermissions.allowedLibraries?.length && absPermissions.allowedLibraries.join(',') !== librariesAccessible.join(',')) {
      if (absPermissions.allowedLibraries.some((lid: any) => typeof lid !== 'string')) {
        throw new Error('Invalid permission property "allowedLibraries", expecting array of strings')
      }
      this.permissions.librariesAccessible = absPermissions.allowedLibraries
      hasUpdates = true
    }

    // Handle allowedTags
    const itemTagsSelected: string[] = this.permissions.itemTagsSelected || []
    if (this.permissions.accessAllTags) {
      if (itemTagsSelected.length) {
        this.permissions.itemTagsSelected = []
        hasUpdates = true
      }
    } else if (absPermissions.allowedTags?.length && absPermissions.allowedTags.join(',') !== itemTagsSelected.join(',')) {
      if (absPermissions.allowedTags.some((tag: any) => typeof tag !== 'string')) {
        throw new Error('Invalid permission property "allowedTags", expecting array of strings')
      }
      this.permissions.itemTagsSelected = absPermissions.allowedTags
      hasUpdates = true
    }

    if (hasUpdates) {
      this.changed('permissions', true)
      await this.save()
    }

    return hasUpdates
  }

  async update(values: any, options?: any): Promise<any> {
    userCache.maybeInvalidate(this)
    return await super.update(values, options)
  }

  async save(options?: any): Promise<any> {
    userCache.maybeInvalidate(this)
    return await super.save(options)
  }

  async destroy(options?: any): Promise<any> {
    userCache.delete(this.id)
    await super.destroy(options)
  }
}

export default User
module.exports = User
