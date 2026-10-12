import { DataTypes, Model } from 'sequelize'
const oldDevice = require('../objects/DeviceInfo')

class Device extends Model {
  declare id: string
  declare deviceId: string
  declare clientName: string | null
  declare clientVersion: string | null
  declare ipAddress: string
  declare deviceName: string | null
  declare deviceVersion: string | null
  declare extraData: Record<string, any>
  declare userId: string
  declare createdAt: Date
  declare updatedAt: Date

  declare user?: any

  static async getOldDeviceByDeviceId(deviceId: string): Promise<any> {
    const device: any = await this.findOne({
      where: {
        deviceId
      }
    })
    if (!device) return null
    return device.getOldDevice()
  }

  static createFromOld(oldDeviceInfo: any): Promise<any> {
    const device = this.getFromOld(oldDeviceInfo)
    return this.create(device)
  }

  static updateFromOld(oldDeviceInfo: any): Promise<any> {
    const device = this.getFromOld(oldDeviceInfo)
    return this.update(device, {
      where: {
        id: device.id
      }
    })
  }

  static getFromOld(oldDeviceInfo: any): Record<string, any> {
    const extraData: Record<string, any> = {}

    if (oldDeviceInfo.manufacturer) {
      extraData.manufacturer = oldDeviceInfo.manufacturer
    }
    if (oldDeviceInfo.model) {
      extraData.model = oldDeviceInfo.model
    }
    if (oldDeviceInfo.osName) {
      extraData.osName = oldDeviceInfo.osName
    }
    if (oldDeviceInfo.osVersion) {
      extraData.osVersion = oldDeviceInfo.osVersion
    }
    if (oldDeviceInfo.browserName) {
      extraData.browserName = oldDeviceInfo.browserName
    }

    return {
      id: oldDeviceInfo.id,
      deviceId: oldDeviceInfo.deviceId,
      clientName: oldDeviceInfo.clientName || null,
      clientVersion: oldDeviceInfo.clientVersion || null,
      ipAddress: oldDeviceInfo.ipAddress,
      deviceName: oldDeviceInfo.deviceName || null,
      deviceVersion: oldDeviceInfo.sdkVersion || oldDeviceInfo.browserVersion || null,
      userId: oldDeviceInfo.userId,
      extraData
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
        deviceId: DataTypes.STRING,
        clientName: DataTypes.STRING, // e.g. Abs Web, Abs Android
        clientVersion: DataTypes.STRING, // e.g. Server version or mobile version
        ipAddress: DataTypes.STRING,
        deviceName: DataTypes.STRING, // e.g. Windows 10 Chrome, Google Pixel 6, Apple iPhone 10,3
        deviceVersion: DataTypes.STRING, // e.g. Browser version or Android SDK
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'device'
      }
    )

    const { user } = sequelize.models

    user.hasMany(Device, {
      onDelete: 'CASCADE'
    })
    Device.belongsTo(user)
  }

  toOldJSON(): Record<string, any> {
    let browserVersion: string | null = null
    let sdkVersion: string | null = null
    if (this.clientName === 'Abs Android') {
      sdkVersion = this.deviceVersion || null
    } else {
      browserVersion = this.deviceVersion || null
    }

    return {
      id: this.id,
      deviceId: this.deviceId,
      userId: this.userId,
      ipAddress: this.ipAddress,
      browserName: this.extraData?.browserName || null,
      browserVersion,
      osName: this.extraData?.osName || null,
      osVersion: this.extraData?.osVersion || null,
      clientVersion: this.clientVersion || null,
      manufacturer: this.extraData?.manufacturer || null,
      model: this.extraData?.model || null,
      sdkVersion,
      deviceName: this.deviceName,
      clientName: this.clientName
    }
  }

  getOldDevice(): any {
    let browserVersion: string | null = null
    let sdkVersion: string | null = null
    if (this.clientName === 'Abs Android') {
      sdkVersion = this.deviceVersion || null
    } else {
      browserVersion = this.deviceVersion || null
    }

    return new oldDevice({
      id: this.id,
      deviceId: this.deviceId,
      userId: this.userId,
      ipAddress: this.ipAddress,
      browserName: this.extraData?.browserName || null,
      browserVersion,
      osName: this.extraData?.osName || null,
      osVersion: this.extraData?.osVersion || null,
      clientVersion: this.clientVersion || null,
      manufacturer: this.extraData?.manufacturer || null,
      model: this.extraData?.model || null,
      sdkVersion,
      deviceName: this.deviceName,
      clientName: this.clientName
    })
  }
}

export default Device
module.exports = Device
