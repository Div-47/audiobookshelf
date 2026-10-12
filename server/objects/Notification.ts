const uuidv4 = require("uuid").v4

interface NotificationData {
  id?: string | null
  libraryId?: string | null
  eventName?: string
  urls?: string[]
  titleTemplate?: string
  bodyTemplate?: string
  type?: string | null
  enabled?: boolean
  lastFiredAt?: number | null
  lastAttemptFailed?: boolean
  numConsecutiveFailedAttempts?: number
  numTimesFired?: number
  createdAt?: number | null
}
type TemplateData = Record<string, string | number | boolean | null | undefined>

class Notification {
  id: string | null | undefined = null
  libraryId: string | null = null
  eventName: string | undefined = ''
  urls: string[] | undefined = []
  titleTemplate: string | undefined = ''
  bodyTemplate: string | undefined = ''
  type: string | null = 'info'
  enabled = false
  lastFiredAt: number | null = null
  lastAttemptFailed = false
  numConsecutiveFailedAttempts = 0
  numTimesFired = 0
  createdAt: number | null | undefined = null

  constructor(notification: NotificationData | null = null) {
    this.id = null
    this.libraryId = null
    this.eventName = ''
    this.urls = []
    this.titleTemplate = ''
    this.bodyTemplate = ''
    this.type = 'info'
    this.enabled = false

    this.lastFiredAt = null
    this.lastAttemptFailed = false
    this.numConsecutiveFailedAttempts = 0
    this.numTimesFired = 0
    this.createdAt = null

    if (notification) {
      this.construct(notification)
    }
  }

  construct(notification: NotificationData): void {
    this.id = notification.id
    this.libraryId = notification.libraryId || null
    this.eventName = notification.eventName
    this.urls = notification.urls || []
    this.titleTemplate = notification.titleTemplate || ''
    this.bodyTemplate = notification.bodyTemplate || ''
    this.type = notification.type || 'info'
    this.enabled = !!notification.enabled
    this.lastFiredAt = notification.lastFiredAt || null
    this.lastAttemptFailed = !!notification.lastAttemptFailed
    this.numConsecutiveFailedAttempts = notification.numConsecutiveFailedAttempts || 0
    this.numTimesFired = notification.numTimesFired || 0
    this.createdAt = notification.createdAt
  }

  toJSON() {
    return {
      id: this.id,
      libraryId: this.libraryId,
      eventName: this.eventName,
      urls: this.urls,
      titleTemplate: this.titleTemplate,
      bodyTemplate: this.bodyTemplate,
      enabled: this.enabled,
      type: this.type,
      lastFiredAt: this.lastFiredAt,
      lastAttemptFailed: this.lastAttemptFailed,
      numConsecutiveFailedAttempts: this.numConsecutiveFailedAttempts,
      numTimesFired: this.numTimesFired,
      createdAt: this.createdAt
    }
  }

  setData(payload: NotificationData): void {
    this.id = uuidv4()
    this.libraryId = payload.libraryId || null
    this.eventName = payload.eventName
    this.urls = payload.urls
    this.titleTemplate = payload.titleTemplate
    this.bodyTemplate = payload.bodyTemplate
    this.enabled = !!payload.enabled
    this.type = payload.type || null
    this.createdAt = Date.now()
  }

  update(payload: NotificationData): boolean {
    if (!this.enabled && payload.enabled) {
      // Reset
      this.lastFiredAt = null
      this.lastAttemptFailed = false
      this.numConsecutiveFailedAttempts = 0
    }

    const keysToUpdate = ['libraryId', 'eventName', 'urls', 'titleTemplate', 'bodyTemplate', 'enabled', 'type']
    var hasUpdated = false
    for (const key of keysToUpdate as Array<keyof NotificationData>) {
      if (payload[key] !== undefined) {
        if (key === 'urls') {
          const urls = payload[key] as string[]
          if (urls.join(',') !== (this.urls as string[]).join(',')) {
            this.urls = [...urls]
            hasUpdated = true
          }
        } else if (Reflect.get(payload, key) !== Reflect.get(this, key)) {
          Reflect.set(this, key, Reflect.get(payload, key))
          hasUpdated = true
        }
      }
    }
    return hasUpdated
  }

  updateNotificationFired(success: boolean): void {
    this.lastFiredAt = Date.now()
    this.lastAttemptFailed = !success
    this.numConsecutiveFailedAttempts = success ? 0 : this.numConsecutiveFailedAttempts + 1
    this.numTimesFired++
  }

  replaceVariablesInTemplate(templateText: string | undefined, data: TemplateData): string {
    const ptrn = /{{ ?([a-zA-Z]+) ?}}/mg

    var match
    var updatedTemplate = templateText
    while ((match = ptrn.exec(templateText as string)) != null) {
      if (data[match[1]]) {
        updatedTemplate = (updatedTemplate as string).replace(match[0], String(data[match[1]]))
      }
    }
    return updatedTemplate as string
  }

  parseTitleTemplate(data: TemplateData): string {
    return this.replaceVariablesInTemplate(this.titleTemplate, data)
  }

  parseBodyTemplate(data: TemplateData): string {
    return this.replaceVariablesInTemplate(this.bodyTemplate, data)
  }

  getApprisePayload(data: TemplateData) {
    return {
      urls: this.urls,
      title: this.parseTitleTemplate(data),
      body: this.parseBodyTemplate(data)
    }
  }
}
export = Notification
