const uuidv4 = require('uuid').v4
const { stripAllTags } = require('../utils/htmlSanitizer')

interface DeviceInfoValues {
  id?: string | null
  userId?: string | null
  deviceId?: string | null
  ipAddress?: string | null
  browserName?: string | null
  browserVersion?: string | null
  osName?: string | null
  osVersion?: string | null
  deviceType?: string | null
  clientVersion?: string | null
  manufacturer?: string | null
  model?: string | null
  sdkVersion?: string | number | null
  clientName?: string | null
  deviceName?: string | null
  [key: string]: unknown
}
interface ParsedAgent {
  browser: { name?: string; version?: string }
  os: { name?: string; version?: string }
  device: { type?: string }
}
interface DeviceInfoJSON { [key: string]: string | null | undefined }

class DeviceInfo {
  /** @type {string[]} Fields to sanitize when loading from stored data */
  static stringFields = ['deviceId', 'clientVersion', 'manufacturer', 'model', 'sdkVersion', 'clientName', 'deviceName']

  id: string | null = null
  userId: string | null = null
  deviceId: string | null = null
  ipAddress: string | null = null
  browserName: string | null = null
  browserVersion: string | null = null
  osName: string | null = null
  osVersion: string | null = null
  deviceType: string | null = null
  clientVersion: string | null = null
  manufacturer: string | null = null
  model: string | null = null
  sdkVersion: string | null = null
  clientName: string | null = null
  deviceName: string | null = null

  constructor(deviceInfo: DeviceInfoValues | null = null) {
    this.id = null
    this.userId = null
    this.deviceId = null
    this.ipAddress = null

    // From User Agent (see: https://www.npmjs.com/package/ua-parser-js)
    this.browserName = null
    this.browserVersion = null
    this.osName = null
    this.osVersion = null
    this.deviceType = null

    // From client
    this.clientVersion = null
    this.manufacturer = null
    this.model = null
    this.sdkVersion = null // Android Only

    this.clientName = null
    this.deviceName = null

    if (deviceInfo) {
      this.construct(deviceInfo)
    }
  }

  construct(deviceInfo: DeviceInfoValues): void {
    for (const key in deviceInfo) {
      const value = Reflect.get(deviceInfo, key)
      if (value !== undefined && Reflect.get(this, key) !== undefined) {
        Reflect.set(this, key, DeviceInfo.stringFields.includes(key) ? stripAllTags(value) : value)
      }
    }
  }

  toJSON(): DeviceInfoJSON {
    const obj = {
      id: this.id,
      userId: this.userId,
      deviceId: this.deviceId,
      ipAddress: this.ipAddress,
      browserName: this.browserName,
      browserVersion: this.browserVersion,
      osName: this.osName,
      osVersion: this.osVersion,
      deviceType: this.deviceType,
      clientVersion: this.clientVersion,
      manufacturer: this.manufacturer,
      model: this.model,
      sdkVersion: this.sdkVersion,
      clientName: this.clientName,
      deviceName: this.deviceName
    }
    for (const key of Object.keys(obj) as Array<keyof typeof obj>) {
      if (obj[key] === null || obj[key] === undefined) {
        delete obj[key]
      }
    }
    return obj
  }

  get deviceDescription(): string {
    if (this.model) {
      // Set from mobile apps
      if (this.sdkVersion) return `${this.model} SDK ${this.sdkVersion} / v${this.clientVersion}`
      return `${this.model} / v${this.clientVersion}`
    }
    return `${this.osName} ${this.osVersion} / ${this.browserName}`
  }

  // When client doesn't send a device id
  getTempDeviceId() {
    const keys = [this.userId, this.browserName, this.browserVersion, this.osName, this.osVersion, this.clientVersion, this.manufacturer, this.model, this.sdkVersion, this.ipAddress].map((k) => k || '')
    return 'temp-' + Buffer.from(keys.join('-'), 'utf-8').toString('base64')
  }

  setData(ip: string | null, ua: ParsedAgent | null, clientDeviceInfo: DeviceInfoValues | null, serverVersion: string, userId: string): void {
    this.id = uuidv4()
    this.userId = userId
    this.deviceId = clientDeviceInfo?.deviceId || this.id
    this.ipAddress = ip || null

    this.browserName = ua?.browser?.name || null
    this.browserVersion = ua?.browser?.version || null
    this.osName = ua?.os?.name || null
    this.osVersion = ua?.os?.version || null
    this.deviceType = ua?.device?.type || null

    this.clientVersion = stripAllTags(clientDeviceInfo?.clientVersion) || serverVersion
    this.manufacturer = stripAllTags(clientDeviceInfo?.manufacturer) || null
    this.model = stripAllTags(clientDeviceInfo?.model) || null

    if (typeof clientDeviceInfo?.sdkVersion === 'number') {
      this.sdkVersion = clientDeviceInfo.sdkVersion.toString()
    } else {
      this.sdkVersion = stripAllTags(clientDeviceInfo?.sdkVersion) || null
    }

    this.clientName = stripAllTags(clientDeviceInfo?.clientName) || null
    if (this.sdkVersion) {
      if (!this.clientName) this.clientName = 'Abs Android'
      this.deviceName = `${this.manufacturer || 'Unknown'} ${this.model || ''}`
    } else if (this.model) {
      if (!this.clientName) this.clientName = 'Abs iOS'
      this.deviceName = `${this.manufacturer || 'Unknown'} ${this.model || ''}`
    } else if (this.osName && this.browserName) {
      if (!this.clientName) this.clientName = 'Abs Web'
      this.deviceName = `${this.osName} ${this.osVersion || 'N/A'} ${this.browserName}`
    } else if (!this.clientName) {
      this.clientName = 'Unknown'
    }

    if (!this.deviceId) {
      this.deviceId = this.getTempDeviceId()
    }
  }

  update(deviceInfo: DeviceInfo | DeviceInfoValues): boolean {
    const deviceInfoJson = deviceInfo instanceof DeviceInfo ? deviceInfo.toJSON() : deviceInfo
    const existingDeviceInfoJson = this.toJSON()

    let hasUpdates = false
    for (const key in deviceInfoJson) {
      if (['id', 'deviceId'].includes(key)) continue

      if (Reflect.get(deviceInfoJson, key) !== Reflect.get(existingDeviceInfoJson, key)) {
        Reflect.set(this, key, Reflect.get(deviceInfoJson, key))
        hasUpdates = true
      }
    }

    for (const key in existingDeviceInfoJson) {
      if (['id', 'deviceId'].includes(key)) continue

      if (Reflect.get(existingDeviceInfoJson, key) && !Reflect.get(deviceInfoJson, key)) {
        Reflect.set(this, key, null)
        hasUpdates = true
      }
    }

    return hasUpdates
  }
}
export = DeviceInfo
