import { DataTypes, Model, where, fn, col, literal } from 'sequelize'

const { getTitlePrefixAtEnd, getTitleIgnorePrefix } = require('../utils/index')

export interface OldSeriesJSON {
  id: string
  name: string
  nameIgnorePrefix: string
  description: string | null
  addedAt: number
  updatedAt: number
  libraryId: string
}

class Series extends Model {
  declare id: string
  declare name: string
  declare nameIgnorePrefix: string
  declare description: string | null
  declare libraryId: string
  declare createdAt: Date
  declare updatedAt: Date

  // Expanded properties
  declare books?: any[]

  /**
   * Check if series exists
   * @param {string} seriesId
   * @returns {Promise<boolean>}
   */
  static async checkExistsById(seriesId: string): Promise<boolean> {
    return (await this.count({ where: { id: seriesId } })) > 0
  }

  /**
   * Get series by name and libraryId. name case insensitive
   *
   * @param {string} seriesName
   * @param {string} libraryId
   * @returns {Promise<Series|null>}
   */
  static async getByNameAndLibrary(seriesName: string, libraryId: string): Promise<Series | null> {
    return this.findOne({
      where: [
        where(fn('lower', col('name')), seriesName.toLowerCase()),
        {
          libraryId
        }
      ]
    })
  }

  /**
   *
   * @param {string} seriesId
   * @returns {Promise<Series|null>}
   */
  static async getExpandedById(seriesId: string): Promise<Series | null> {
    const series: any = await this.findByPk(seriesId)
    if (!series) return null
    series.books = await series.getBooksExpandedWithLibraryItem()
    return series
  }

  /**
   *
   * @param {string} seriesName
   * @param {string} libraryId
   * @returns {Promise<Series>}
   */
  static async findOrCreateByNameAndLibrary(seriesName: string, libraryId: string): Promise<Series> {
    const series = await this.getByNameAndLibrary(seriesName, libraryId)
    if (series) return series
    return this.create({
      name: seriesName,
      nameIgnorePrefix: getTitleIgnorePrefix(seriesName),
      libraryId
    })
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
        nameIgnorePrefix: DataTypes.STRING,
        description: DataTypes.TEXT
      },
      {
        sequelize,
        modelName: 'series',
        indexes: [
          {
            fields: [
              {
                name: 'name',
                collate: 'NOCASE'
              }
            ]
          },
          {
            // unique constraint on name and libraryId
            fields: ['name', 'libraryId'],
            unique: true,
            name: 'unique_series_name_per_library'
          },
          {
            fields: ['libraryId']
          }
        ]
      }
    )

    const { library } = sequelize.models
    library.hasMany(Series, {
      onDelete: 'CASCADE'
    })
    Series.belongsTo(library)
  }

  /**
   * Get all books in collection expanded with library item
   *
   * @returns {Promise<any[]>}
   */
  getBooksExpandedWithLibraryItem(): Promise<any[]> {
    return (this as any).getBooks({
      joinTableAttributes: ['sequence'],
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
      ],
      order: [[literal('CAST(`bookSeries.sequence` AS FLOAT) ASC NULLS LAST')]]
    })
  }

  toOldJSON(): OldSeriesJSON {
    return {
      id: this.id,
      name: this.name,
      nameIgnorePrefix: getTitlePrefixAtEnd(this.name),
      description: this.description,
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
      libraryId: this.libraryId
    }
  }

  toJSONMinimal(sequence?: string): { id: string; name: string; sequence?: string } {
    return {
      id: this.id,
      name: this.name,
      sequence
    }
  }
}

export default Series
module.exports = Series
