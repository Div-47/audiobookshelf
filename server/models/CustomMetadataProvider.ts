import { DataTypes, Model } from 'sequelize'

export interface ClientCustomMetadataProvider {
  id: string
  name: string
  url?: string
  mediaType: string
  slug: string
}

class CustomMetadataProvider extends Model {
  declare id: string
  declare mediaType: string
  declare name: string
  declare url: string
  declare authHeaderValue: string
  declare extraData: Record<string, any>
  declare createdAt: Date
  declare updatedAt: Date

  /**
   * Get providers for client by media type
   * Currently only available for "book" media type
   *
   * @param {string} mediaType
   * @returns {Promise<ClientCustomMetadataProvider[]>}
   */
  static async getForClientByMediaType(mediaType: string): Promise<ClientCustomMetadataProvider[]> {
    if (mediaType !== 'book') return []
    const customMetadataProviders = await this.findAll({
      where: {
        mediaType
      }
    })
    return customMetadataProviders.map((cmp: any) => cmp.toClientJson())
  }

  /**
   * Check if provider exists by slug
   *
   * @param {string} providerSlug
   * @returns {Promise<boolean>}
   */
  static async checkExistsBySlug(providerSlug: string): Promise<boolean> {
    const providerId = providerSlug?.split?.('custom-')[1]
    if (!providerId) return false

    return (await this.count({ where: { id: providerId } })) > 0
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
        mediaType: DataTypes.STRING,
        url: DataTypes.STRING,
        authHeaderValue: DataTypes.STRING,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'customMetadataProvider'
      }
    )
  }

  getSlug(): string {
    return `custom-${this.id}`
  }

  /**
   * Safe for clients
   * @returns {ClientCustomMetadataProvider}
   */
  toClientJson(): ClientCustomMetadataProvider {
    return {
      id: this.id,
      name: this.name,
      mediaType: this.mediaType,
      slug: this.getSlug()
    }
  }
}

export default CustomMetadataProvider
module.exports = CustomMetadataProvider
