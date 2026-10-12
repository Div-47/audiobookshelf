import { DataTypes, Model, Op } from 'sequelize'

class Session extends Model {
  declare id: string
  declare ipAddress: string
  declare userAgent: string
  declare createdAt: Date
  declare updatedAt: Date
  declare userId: string
  declare expiresAt: Date
  declare lastRefreshToken: string | null
  declare lastRefreshTokenExpiresAt: Date | null

  // Expanded properties
  declare user?: any

  static async createSession(userId: string, ipAddress: string, userAgent: string, refreshToken: string, expiresAt: Date) {
    const session = await Session.create({ userId, ipAddress, userAgent, refreshToken, expiresAt })
    return session
  }

  /**
   * Clean up expired sessions from the database
   * @returns {Promise<number>} Number of sessions deleted
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const deletedCount = await Session.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date()
        }
      }
    })
    return deletedCount
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
        ipAddress: DataTypes.STRING,
        userAgent: DataTypes.STRING,
        refreshToken: {
          type: DataTypes.STRING,
          allowNull: false
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: false
        },
        lastRefreshToken: {
          type: DataTypes.STRING,
          allowNull: true
        },
        lastRefreshTokenExpiresAt: {
          type: DataTypes.DATE,
          allowNull: true
        }
      },
      {
        sequelize,
        modelName: 'session'
      }
    )

    const { user } = sequelize.models
    user.hasMany(Session, {
      onDelete: 'CASCADE',
      foreignKey: {
        allowNull: false
      }
    })
    Session.belongsTo(user)
  }
}

export default Session
module.exports = Session
