const Path = require('path')
const date = require('../libs/dateAndTime')
const version = require('../../package.json').version

interface BackupSourceData { details: string[]; fullPath: string }

class Backup {
  id: string | null = null
  key: string | null = null
  datePretty: string | null = null
  backupDirPath: string | null = null
  filename: string | null = null
  path: string | null = null
  fullPath: string | null = null
  serverVersion: string | null = null
  fileSize: number | null = null
  createdAt: number | null = null

  constructor(data: BackupSourceData | null = null) {
    this.id = null
    this.key = null // Special key for pre-version checks
    this.datePretty = null

    this.backupDirPath = null
    this.filename = null
    this.path = null
    this.fullPath = null
    this.serverVersion = null

    this.fileSize = null
    this.createdAt = null

    if (data) {
      this.construct(data)
    }
  }

  get detailsString(): string {
    const details = []
    details.push(this.id)
    details.push(this.key)
    details.push(this.createdAt)
    details.push(this.serverVersion)
    return details.join('\n')
  }

  construct(data: BackupSourceData): void {
    this.id = data.details[0]
    this.key = data.details[1]
    if (this.key == '1') this.key = null // v2.2.23 and below backups stored '1' here

    this.createdAt = Number(data.details[2])
    this.serverVersion = data.details[3] || null

    this.datePretty = date.format(new Date(this.createdAt), 'ddd, MMM D YYYY HH:mm')

    this.backupDirPath = Path.dirname(data.fullPath)
    this.filename = Path.basename(data.fullPath)
    this.path = Path.join('backups', this.filename)
    this.fullPath = data.fullPath
  }

  toJSON() {
    return {
      id: this.id,
      key: this.key,
      backupDirPath: this.backupDirPath,
      datePretty: this.datePretty,
      fullPath: this.fullPath,
      path: this.path,
      filename: this.filename,
      fileSize: this.fileSize,
      createdAt: this.createdAt,
      serverVersion: this.serverVersion
    }
  }

  setData(backupDirPath: string): void {
    this.id = date.format(new Date(), 'YYYY-MM-DD[T]HHmm')
    this.key = 'sqlite'
    this.datePretty = date.format(new Date(), 'ddd, MMM D YYYY HH:mm')

    this.backupDirPath = backupDirPath

    this.filename = this.id + '.audiobookshelf'
    this.path = Path.join('backups', this.filename)
    this.fullPath = Path.join(this.backupDirPath, this.filename)

    this.serverVersion = version

    this.createdAt = Date.now()
  }
}
export = Backup
