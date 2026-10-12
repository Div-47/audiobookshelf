import { DataTypes, Model, where, fn, col } from 'sequelize'
const parseNameString = require('../utils/parsers/parseNameString')

export interface OldAuthorJSON {
  id: string
  asin: string | null
  name: string
  description: string | null
  imagePath: string | null
  libraryId: string
  addedAt: number
  updatedAt: number
  numBooks?: number
}

class Author extends Model {
  declare id: string
  declare name: string
  declare lastFirst: string | null
  declare asin: string | null
  declare description: string | null
  declare imagePath: string | null
  declare libraryId: string
  declare updatedAt: Date
  declare createdAt: Date

  declare books?: any[]

  /**
   *
   * @param {string} name
   * @returns {string|null}
   */
  static getLastFirst(name: string): string | null {
    if (!name) return null
    return parseNameString.nameToLastFirst(name)
  }

  /**
   * Check if author exists
   * @param {string} authorId
   * @returns {Promise<boolean>}
   */
  static async checkExistsById(authorId: string): Promise<boolean> {
    return (await this.count({ where: { id: authorId } })) > 0
  }

  /**
   * Get author by name and libraryId. name case insensitive
   * TODO: Look for authors ignoring punctuation
   *
   * @param {string} authorName
   * @param {string} libraryId
   * @returns {Promise<Author|null>}
   */
  static async getByNameAndLibrary(authorName: string, libraryId: string): Promise<Author | null> {
    return this.findOne({
      where: [
        where(fn('lower', col('name')), authorName.toLowerCase()),
        {
          libraryId
        }
      ]
    })
  }

  /**
   *
   * @param {string} authorId
   * @returns {Promise<any[]>}
   */
  static async getAllLibraryItemsForAuthor(authorId: string): Promise<any[]> {
    const author: any = await this.findByPk(authorId, {
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
        }
      ]
    })

    const libraryItems: any[] = []
    if (author?.books) {
      for (const book of author.books) {
        const libraryItem = book.libraryItem
        libraryItem.media = book
        delete book.libraryItem
        libraryItems.push(libraryItem)
      }
    }

    return libraryItems
  }

  /**
   *
   * @param {string} name
   * @param {string} libraryId
   * @returns {Promise<{ author: Author, created: boolean }>}
   */
  static async findOrCreateByNameAndLibrary(name: string, libraryId: string): Promise<{ author: Author; created: boolean }> {
    const author = await this.getByNameAndLibrary(name, libraryId)
    if (author) return { author, created: false }
    const newAuthor: any = await this.create({
      name,
      lastFirst: this.getLastFirst(name),
      libraryId
    })
    return { author: newAuthor, created: true }
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
        lastFirst: DataTypes.STRING,
        asin: DataTypes.STRING,
        description: DataTypes.TEXT,
        imagePath: DataTypes.STRING
      },
      {
        sequelize,
        modelName: 'author',
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
            fields: ['libraryId']
          }
        ]
      }
    )

    const { library } = sequelize.models
    library.hasMany(Author, {
      onDelete: 'CASCADE'
    })
    Author.belongsTo(library)
  }

  toOldJSON(): OldAuthorJSON {
    return {
      id: this.id,
      asin: this.asin,
      name: this.name,
      description: this.description,
      imagePath: this.imagePath,
      libraryId: this.libraryId,
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf()
    }
  }

  /**
   *
   * @param {number} numBooks
   * @returns
   */
  toOldJSONExpanded(numBooks = 0): OldAuthorJSON {
    const oldJson = this.toOldJSON()
    oldJson.numBooks = numBooks
    return oldJson
  }

  toJSONMinimal(): { id: string; name: string } {
    return {
      id: this.id,
      name: this.name
    }
  }
}

export default Author
module.exports = Author
