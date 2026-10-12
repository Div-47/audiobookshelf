import { DataTypes, Model, Op } from 'sequelize'
const jwt = require('jsonwebtoken')
const { LRUCache } = require('lru-cache')
const Logger = require('../Logger')

export interface ApiKeyPermissions {
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

class ApiKeyCache {
  cache: any

  constructor() {
    this.cache = new LRUCache({ max: 100 })
  }

  getById(id: string): any {
    const apiKey = this.cache.get(id)
    return apiKey
  }

  set(apiKey: any): void {
    apiKey.fromCache = true
    this.cache.set(apiKey.id, apiKey)
  }

  delete(apiKeyId: string): void {
    this.cache.delete(apiKeyId)
  }

  maybeInvalidate(apiKey: any): void {
    if (!apiKey.fromCache) this.delete(apiKey.id)
  }
}

const apiKeyCache = new ApiKeyCache()

class ApiKey extends Model {
  declare id: string
  declare name: string
  declare description: string | null
  declare expiresAt: Date | null
  declare lastUsedAt: Date | null
  declare isActive: boolean
  declare permissions: ApiKeyPermissions
  declare createdAt: Date
  declare updatedAt: Date
  declare userId: string
  declare createdByUserId: string | null

  declare fromCache?: boolean
  declare user?: any

  /**
   * Same properties as User.getDefaultPermissions
   */
  static getDefaultPermissions(): ApiKeyPermissions {
    return {
      download: true,
      update: true,
      delete: true,
      upload: true,
      createEreader: true,
      accessAllLibraries: true,
      accessAllTags: true,
      accessExplicitContent: true,
      selectedTagsNotAccessible: false, // Inverts itemTagsSelected
      librariesAccessible: [],
      itemTagsSelected: []
    }
  }

  /**
   * Merge permissions from request with default permissions
   */
  static mergePermissionsWithDefault(reqPermissions: any): ApiKeyPermissions {
    const permissions = this.getDefaultPermissions()

    if (!reqPermissions || typeof reqPermissions !== 'object') {
      Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permissions: ${reqPermissions}`)
      return permissions
    }

    for (const key in reqPermissions) {
      if (reqPermissions[key] === undefined) {
        Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permission key: ${key}`)
        continue
      }

      if (key === 'librariesAccessible' || key === 'itemTagsSelected') {
        if (!Array.isArray(reqPermissions[key]) || reqPermissions[key].some((value: any) => typeof value !== 'string')) {
          Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid ${key} value: ${reqPermissions[key]}`)
          continue
        }

        (permissions as any)[key] = reqPermissions[key]
      } else if (typeof reqPermissions[key] !== 'boolean') {
        Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permission value for key ${key}. Should be boolean`)
        continue
      }

      (permissions as any)[key] = reqPermissions[key]
    }

    return permissions
  }

  /**
   * Deactivate expired api keys
   */
  static async deactivateExpiredApiKeys(): Promise<number> {
    const [affectedCount] = await ApiKey.update(
      {
        isActive: false
      },
      {
        where: {
          isActive: true,
          expiresAt: {
            [Op.lt]: new Date()
          }
        }
      }
    )
    return affectedCount
  }

  /**
   * Generate a new api key
   */
  static async generateApiKey(tokenSecret: string, keyId: string, name: string, expiresIn?: number): Promise<string | null> {
    const options: Record<string, any> = {}
    if (expiresIn && !isNaN(expiresIn) && expiresIn > 0) {
      options.expiresIn = expiresIn
    }

    return new Promise((resolve) => {
      jwt.sign(
        {
          keyId,
          name,
          type: 'api'
        },
        tokenSecret,
        options,
        (err: any, token: string) => {
          if (err) {
            Logger.error(`[ApiKey] Error generating API key: ${err}`)
            resolve(null)
          } else {
            resolve(token)
          }
        }
      )
    })
  }

  /**
   * Get an api key by id, from cache or database
   */
  static async getById(apiKeyId: string): Promise<ApiKey | null> {
    if (!apiKeyId) return null

    const cachedApiKey = apiKeyCache.getById(apiKeyId)
    if (cachedApiKey) return cachedApiKey

    const apiKey = await ApiKey.findByPk(apiKeyId)
    if (!apiKey) return null

    apiKeyCache.set(apiKey)
    return apiKey
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
        name: {
          type: DataTypes.STRING,
          allowNull: false
        },
        description: DataTypes.TEXT,
        expiresAt: DataTypes.DATE,
        lastUsedAt: DataTypes.DATE,
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        permissions: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'apiKey'
      }
    )

    const { user } = sequelize.models
    user.hasMany(ApiKey, {
      onDelete: 'CASCADE'
    })
    ApiKey.belongsTo(user)

    user.hasMany(ApiKey, {
      foreignKey: 'createdByUserId',
      onDelete: 'SET NULL'
    })
    ApiKey.belongsTo(user, { as: 'createdByUser', foreignKey: 'createdByUserId' })
  }

  async update(values: any, options?: any): Promise<any> {
    apiKeyCache.maybeInvalidate(this)
    return await super.update(values, options)
  }

  async save(options?: any): Promise<any> {
    apiKeyCache.maybeInvalidate(this)
    return await super.save(options)
  }

  async destroy(options?: any): Promise<any> {
    apiKeyCache.delete(this.id)
    await super.destroy(options)
  }
}

export default ApiKey
module.exports = ApiKey
