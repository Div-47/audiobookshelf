import { DataTypes, Model } from 'sequelize'

export interface OldLibraryFolderJSON {
  id: string
  fullPath: string
  libraryId: string
  addedAt: number
}

class LibraryFolder extends Model {
  declare id: string
  declare path: string
  declare libraryId: string
  declare createdAt: Date
  declare updatedAt: Date

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
        path: DataTypes.STRING
      },
      {
        sequelize,
        modelName: 'libraryFolder'
      }
    )

    const { library } = sequelize.models
    library.hasMany(LibraryFolder, {
      onDelete: 'CASCADE'
    })
    LibraryFolder.belongsTo(library)
  }

  /**
   * TODO: Update to use new model
   */
  toOldJSON(): OldLibraryFolderJSON {
    return {
      id: this.id,
      fullPath: this.path,
      libraryId: this.libraryId,
      addedAt: this.createdAt.valueOf()
    }
  }
}

export default LibraryFolder
module.exports = LibraryFolder
