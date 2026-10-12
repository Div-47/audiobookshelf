import { DataTypes, Model } from 'sequelize'

class CollectionBook extends Model {
  declare id: string
  declare order: number
  declare bookId: string
  declare collectionId: string
  declare createdAt: Date

  static init(sequelize: any): any {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        order: DataTypes.INTEGER
      },
      {
        sequelize,
        timestamps: true,
        updatedAt: false,
        modelName: 'collectionBook'
      }
    )

    // Super Many-to-Many
    // ref: https://sequelize.org/docs/v6/advanced-association-concepts/advanced-many-to-many/#the-best-of-both-worlds-the-super-many-to-many-relationship
    const { book, collection } = sequelize.models
    book.belongsToMany(collection, { through: CollectionBook })
    collection.belongsToMany(book, { through: CollectionBook })

    book.hasMany(CollectionBook, {
      onDelete: 'CASCADE'
    })
    CollectionBook.belongsTo(book)

    collection.hasMany(CollectionBook, {
      onDelete: 'CASCADE'
    })
    CollectionBook.belongsTo(collection)
  }
}

export default CollectionBook
module.exports = CollectionBook
