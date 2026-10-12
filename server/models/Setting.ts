import { DataTypes, Model } from 'sequelize'

const oldEmailSettings = require('../objects/settings/EmailSettings')
const oldServerSettings = require('../objects/settings/ServerSettings')
const oldNotificationSettings = require('../objects/settings/NotificationSettings')

export interface OldSettingsResult {
  settings: any[]
  emailSettings: any
  serverSettings: any
  notificationSettings: any
}

class Setting extends Model {
  declare key: string
  declare value: Record<string, any>
  declare createdAt: Date
  declare updatedAt: Date

  static async getOldSettings(): Promise<OldSettingsResult> {
    const settings = (await this.findAll()).map((se: any) => se.value)

    const emailSettingsJson = settings.find((se: any) => se.id === 'email-settings')
    const serverSettingsJson = settings.find((se: any) => se.id === 'server-settings')
    const notificationSettingsJson = settings.find((se: any) => se.id === 'notification-settings')

    return {
      settings,
      emailSettings: new oldEmailSettings(emailSettingsJson),
      serverSettings: new oldServerSettings(serverSettingsJson),
      notificationSettings: new oldNotificationSettings(notificationSettingsJson)
    }
  }

  static updateSettingObj(setting: { id: string; [key: string]: any }) {
    return this.upsert({
      key: setting.id,
      value: setting
    })
  }

  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize: any): any {
    super.init(
      {
        key: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        value: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'setting'
      }
    )
  }
}

export default Setting
module.exports = Setting
