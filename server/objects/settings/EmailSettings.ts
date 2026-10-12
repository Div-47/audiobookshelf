const Logger = require('../../Logger')
const { areEquivalent, copyValue, isNullOrNaN } = require('../../utils')

/**
 * @typedef EreaderDeviceObject
 */
export interface EreaderDeviceObject {
  name: string
  email: string
  availabilityOption?: 'adminOrUp' | 'userOrUp' | 'guestOrUp' | 'specificUsers' | string
  users?: string[]
}

export interface EmailSettingsJSON {
  id: string
  host: string | null
  port: number
  secure: boolean
  rejectUnauthorized: boolean
  user: string | null
  pass: string | null
  testAddress: string | null
  fromAddress: string | null
  ereaderDevices: EreaderDeviceObject[]
}

export interface EmailTransportObject {
  host: string | null
  secure: boolean
  port?: number
  auth?: {
    user: string
    pass: string
  }
  tls?: {
    rejectUnauthorized: boolean
  }
}

// REF: https://nodemailer.com/smtp/
class EmailSettings {
  id: string
  host: string | null
  port: number
  secure: boolean
  rejectUnauthorized: boolean
  user: string | null
  pass: string | null
  testAddress: string | null
  fromAddress: string | null
  ereaderDevices: EreaderDeviceObject[]
  [key: string]: unknown

  constructor(settings: any = null) {
    this.id = 'email-settings'
    this.host = null
    this.port = 465
    this.secure = true
    this.rejectUnauthorized = true
    this.user = null
    this.pass = null
    this.testAddress = null
    this.fromAddress = null

    this.ereaderDevices = []

    if (settings) {
      this.construct(settings)
    }
  }

  construct(settings: any) {
    this.host = settings.host
    this.port = settings.port
    this.secure = !!settings.secure
    this.rejectUnauthorized = !!settings.rejectUnauthorized
    this.user = settings.user
    this.pass = settings.pass
    this.testAddress = settings.testAddress
    this.fromAddress = settings.fromAddress
    this.ereaderDevices = settings.ereaderDevices?.map((d: any) => ({ ...d })) || []

    // rejectUnauthorized added after v2.10.1 - defaults to true
    if (settings.rejectUnauthorized === undefined) {
      this.rejectUnauthorized = true
    }
  }

  toJSON(): EmailSettingsJSON {
    return {
      id: this.id,
      host: this.host,
      port: this.port,
      secure: this.secure,
      rejectUnauthorized: this.rejectUnauthorized,
      user: this.user,
      pass: this.pass,
      testAddress: this.testAddress,
      fromAddress: this.fromAddress,
      ereaderDevices: this.ereaderDevices.map((d) => ({ ...d }))
    }
  }

  update(payload: any): boolean {
    if (!payload) return false

    if (payload.port !== undefined) {
      if (isNullOrNaN(payload.port)) this.port = 465
      else this.port = Number(payload.port)
    }
    if (payload.secure !== undefined) this.secure = !!payload.secure
    if (payload.rejectUnauthorized !== undefined) this.rejectUnauthorized = !!payload.rejectUnauthorized

    if (payload.ereaderDevices !== undefined && !Array.isArray(payload.ereaderDevices)) payload.ereaderDevices = undefined

    if (payload.ereaderDevices?.length) {
      // Validate ereader devices
      payload.ereaderDevices = payload.ereaderDevices
        .map((device: any) => {
          if (!device.name || !device.email) {
            Logger.error(`[EmailSettings] Update ereader device is invalid`, device)
            return null
          }
          if (!device.availabilityOption || !['adminOrUp', 'userOrUp', 'guestOrUp', 'specificUsers'].includes(device.availabilityOption)) {
            device.availabilityOption = 'adminOrUp'
          }
          if (device.availabilityOption === 'specificUsers' && !device.users?.length) {
            device.availabilityOption = 'adminOrUp'
          }
          if (device.availabilityOption !== 'specificUsers' && device.users?.length) {
            device.users = []
          }
          return device
        })
        .filter(Boolean)
    }

    let hasUpdates = false

    const json = this.toJSON() as unknown as Record<string, unknown>
    for (const key in json) {
      if (key === 'id') continue

      if (payload[key] !== undefined && !areEquivalent(payload[key], json[key])) {
        this[key] = copyValue(payload[key])
        hasUpdates = true
      }
    }

    return hasUpdates
  }

  getTransportObject(): EmailTransportObject {
    const payload: EmailTransportObject = {
      host: this.host,
      secure: this.secure
    }
    // Only set to true for port 465 (https://nodemailer.com/smtp/#tls-options)
    if (this.port !== 465) {
      payload.secure = false
    }
    if (this.port) payload.port = this.port
    if (this.user && this.pass !== undefined) {
      payload.auth = {
        user: this.user,
        pass: this.pass as string
      }
    }
    // Allow self-signed certs (https://nodemailer.com/smtp/#3-allow-self-signed-certificates)
    if (!this.rejectUnauthorized) {
      payload.tls = {
        rejectUnauthorized: false
      }
    }

    return payload
  }

  /**
   *
   * @param {EreaderDeviceObject} device
   * @param {any} user
   * @returns {boolean}
   */
  checkUserCanAccessDevice(device: EreaderDeviceObject, user: any): boolean {
    let deviceAvailability = device.availabilityOption || 'adminOrUp'
    if (deviceAvailability === 'adminOrUp' && user.isAdminOrUp) return true
    if (deviceAvailability === 'userOrUp' && (user.isAdminOrUp || user.isUser)) return true
    if (deviceAvailability === 'guestOrUp') return true
    if (deviceAvailability === 'specificUsers') {
      let deviceUsers = device.users || []
      return deviceUsers.includes(user.id)
    }
    return false
  }

  /**
   * Get ereader devices accessible to user
   *
   * @param {any} user
   * @returns {EreaderDeviceObject[]}
   */
  getEReaderDevices(user: any): EreaderDeviceObject[] {
    return this.ereaderDevices.filter((device) => this.checkUserCanAccessDevice(device, user))
  }

  /**
   * Get ereader device by name
   *
   * @param {string} deviceName
   * @returns {EreaderDeviceObject | undefined}
   */
  getEReaderDevice(deviceName: string): EreaderDeviceObject | undefined {
    return this.ereaderDevices.find((d) => d.name === deviceName)
  }
}

module.exports = EmailSettings
