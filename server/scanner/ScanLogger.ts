const uuidv4 = require('uuid').v4
const Logger = require('../Logger')

interface ScanLogEntry {
  timestamp: string
  message: string
  levelName: string
  level: number
}

class ScanLogger {
  id: string | null = null
  type: string | null = null
  name: string | null = null
  verbose = false
  startedAt: number | null = null
  finishedAt: number | null = null
  elapsed: number | null = null
  authorsRemovedFromBooks: string[] = []
  authorsNumBooksChangedIds = new Set<string>()
  seriesRemovedFromBooks: string[] = []
  logs: ScanLogEntry[] = []

  toJSON(): {
    id: string | null
    type: string | null
    name: string | null
    startedAt: number | null
    finishedAt: number | null
    elapsed: number | null
  } {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      elapsed: this.elapsed
    }
  }

  setData(type: string, name: string): void {
    this.id = uuidv4()
    this.type = type
    this.name = name
    this.startedAt = Date.now()
  }

  setComplete(): void {
    this.finishedAt = Date.now()
    this.elapsed = this.finishedAt - this.startedAt!
  }

  addLog(level: number, ...args: unknown[]): void {
    const logObj: ScanLogEntry = {
      timestamp: new Date().toISOString(),
      message: args.join(' '),
      levelName: Logger.getLogLevelString(level),
      level
    }

    if (this.verbose) {
      Logger.debug(`[Scan] "${this.name}":`, ...args)
    }
    this.logs.push(logObj)
  }
}

export = ScanLogger
