import { DataTypes, Model, Sequelize } from 'sequelize'

export interface OldCollectionJSON {
  id: string
  libraryId: string
  name: string
  description: string | null
  books: any[]
  lastUpdate: number
  createdAt: number
  rssFeed?: any
}

class Collection extends Model {
  declare id: string
  declare name: string
  declare description: string | null
  declare libraryId: string
  declare updatedAt: Date
  declare createdAt: Date

  // Expanded properties
  declare books?: any[]
  declare feeds?: any[]

  /**
   * Get all toOldJSONExpanded, items filtered for user permissions
   *
   * @param {any} user
   * @param {string} [libraryId]
   * @param {string[]} [include]
   * @async
   */
  static async getOldCollectionsJsonExpanded(user: any, libraryId?: string, include?: string[]): Promise<any[]> {
    let collectionWhere: any = null
    if (libraryId) {
      collectionWhere = {
        libraryId
      }
    }

    // Optionally include rssfeed for collection
    const collectionIncludes: any[] = []
    if (include?.includes('rssfeed')) {
      collectionIncludes.push({
        model: (this.sequelize as any).models.feed
      })
    }

    const collections: any[] = await this.findAll({
      where: collectionWhere,
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
        ...collectionIncludes
      ],
      order: [[(this.sequelize as any).models.book, (this.sequelize as any).models.collectionBook, 'order', 'ASC']]
    })
    // TODO: Handle user permission restrictions on initial query
    return collections
      .map((c: any) => {
        // Filter books using user permissions
        const books =
          c.books?.filter((b: any) => {
            if (user) {
              if (b.tags?.length && !user.checkCanAccessLibraryItemWithTags(b.tags)) {
                return false
              }
              if (b.explicit === true && !user.canAccessExplicitContent) {
                return false
              }
            }
            return true
          }) || []

        // Users with restricted permissions will not see this collection
        if (!books.length && c.books?.length) {
          return null
        }

        c.books = books

        const collectionExpanded = c.toOldJSONExpanded()

        // Map feed if found
        if (c.feeds?.length) {
          collectionExpanded.rssFeed = c.feeds[0].toOldJSON()
        }

        return collectionExpanded
      })
      .filter((c: any) => c)
  }

  /**
   *
   * @param {string} collectionId
   * @returns {Promise<Collection|null>}
   */
  static async getExpandedById(collectionId: string): Promise<Collection | null> {
    return this.findByPk(collectionId, {
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
      ],
      order: [[(this.sequelize as any).models.book, (this.sequelize as any).models.collectionBook, 'order', 'ASC']]
    })
  }

  /**
   * Remove all collections belonging to library
   * @param {string} libraryId
   * @returns {Promise<number>} number of collections destroyed
   */
  static async removeAllForLibrary(libraryId: string): Promise<number> {
    if (!libraryId) return 0
    return this.destroy({
      where: {
        libraryId
      }
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
        description: DataTypes.TEXT
      },
      {
        sequelize,
        modelName: 'collection'
      }
    )

    const { library } = sequelize.models

    library.hasMany(Collection)
    Collection.belongsTo(library)
  }

  /**
   * Get all books in collection expanded with library item
   *
   * @returns {Promise<any[]>}
   */
  getBooksExpandedWithLibraryItem(): Promise<any[]> {
    return (this as any).getBooks({
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
      order: [Sequelize.literal('`collectionBook.order` ASC')]
    })
  }

  /**
   * Get toOldJSONExpanded, items filtered for user permissions
   *
   * @param {any|null} user
   * @param {string[]} [include]
   * @async
   */
  async getOldJsonExpanded(user?: any, include?: string[]): Promise<any> {
    this.books = await this.getBooksExpandedWithLibraryItem()

    // Filter books using user permissions
    // TODO: Handle user permission restrictions on initial query
    if (user) {
      const books = this.books.filter((b: any) => {
        if (b.tags?.length && !user.checkCanAccessLibraryItemWithTags(b.tags)) {
          return false
        }
        if (b.explicit === true && !user.canAccessExplicitContent) {
          return false
        }
        return true
      })

      // Users with restricted permissions will not see this collection
      if (!books.length && this.books.length) {
        return null
      }

      this.books = books
    }

    const collectionExpanded = this.toOldJSONExpanded()

    if (include?.includes('rssfeed')) {
      const feeds = await (this as any).getFeeds()
      if (feeds?.length) {
        collectionExpanded.rssFeed = feeds[0].toOldJSON()
      }
    }

    return collectionExpanded
  }

  /**
   *
   * @param {string[]} [libraryItemIds=[]]
   * @returns
   */
  toOldJSON(libraryItemIds: string[] = []): OldCollectionJSON {
    return {
      id: this.id,
      libraryId: this.libraryId,
      name: this.name,
      description: this.description,
      books: [...libraryItemIds],
      lastUpdate: this.updatedAt.valueOf(),
      createdAt: this.createdAt.valueOf()
    }
  }

  toOldJSONExpanded(): OldCollectionJSON {
    if (!this.books) {
      throw new Error('Books are required to expand Collection')
    }

    const json = this.toOldJSON()
    json.books = this.books.map((book: any) => {
      const libraryItem = book.libraryItem
      delete book.libraryItem
      libraryItem.media = book
      return libraryItem.toOldJSONExpanded()
    })

    return json
  }
}

export default Collection
module.exports = Collection
