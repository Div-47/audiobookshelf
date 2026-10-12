const Path = require('path')
const uuidv4 = require('uuid').v4
const fs = require('../libs/fsExtra')
const date = require('../libs/dateAndTime')

const Logger = require('../Logger')
const { secondsToTimestamp, elapsedPretty } = require('../utils/index')

interface LibraryScanFolder {
  id: string
  libraryId: string
  path: string
}

interface LibraryScanLibrary {
  id: string
  name: string
  mediaType: string
  libraryFolders: LibraryScanFolder[]
  settings: { [key: string]: unknown }
  toJSON(): Record<string, unknown>
}

interface ScanLogEntry {
  timestamp: string
  message: string
  levelName: string
  level: number
}

interface LibraryScanResults {
  added: number
  updated: number
  missing: number
  elapsed: number | null
  text: string
}

interface LibraryScanData {
  id: string | null
  type: string | null
  library: Record<string, unknown>
  startedAt: number | null
  finishedAt: number | null
  elapsed: number | null
  resultsAdded: number
  resultsUpdated: number
  resultsMissing: number
}

class LibraryScan {
  id: string | null = null
  type: string | null = null
  library: LibraryScanLibrary | null = null
  verbose = false
  startedAt: number | null = null
  finishedAt: number | null = null
  elapsed: number | null = null
  resultsMissing = 0
  resultsAdded = 0
  resultsUpdated = 0
  authorsRemovedFromBooks: string[] = []
  authorsNumBooksChangedIds = new Set<string>()
  seriesRemovedFromBooks: string[] = []
  logs: ScanLogEntry[] = []

  get libraryId(): string {
    return this.library!.id
  }

  get libraryName(): string {
    return this.library!.name
  }

  get libraryMediaType(): string {
    return this.library!.mediaType
  }

  get libraryFolders(): LibraryScanFolder[] {
    return this.library!.libraryFolders
  }

  get timestamp(): string {
    return new Date().toISOString()
  }

  get resultStats(): string {
    return `${this.resultsAdded} Added | ${this.resultsUpdated} Updated | ${this.resultsMissing} Missing`
  }

  get elapsedTimestamp(): string {
    return secondsToTimestamp(this.elapsed! / 1000)
  }

  get logFilename(): string {
    return date.format(new Date(), 'YYYY-MM-DD') + '_' + this.id + '.txt'
  }

  get scanResultsString(): string {
    const strs: string[] = []
    if (this.resultsAdded) strs.push(`${this.resultsAdded} added`)
    if (this.resultsUpdated) strs.push(`${this.resultsUpdated} updated`)
    if (this.resultsMissing) strs.push(`${this.resultsMissing} missing`)
    const changesDetected = strs.length > 0 ? strs.join(', ') : 'No changes needed'
    const timeElapsed = `(${elapsedPretty(this.elapsed! / 1000)})`
    return `${changesDetected} ${timeElapsed}`
  }

  get scanResults(): LibraryScanResults {
    return {
      added: this.resultsAdded,
      updated: this.resultsUpdated,
      missing: this.resultsMissing,
      elapsed: this.elapsed,
      text: this.scanResultsString
    }
  }

  toJSON(): LibraryScanData {
    return {
      id: this.id,
      type: this.type,
      library: this.library!.toJSON(),
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      elapsed: this.elapsed,
      resultsAdded: this.resultsAdded,
      resultsUpdated: this.resultsUpdated,
      resultsMissing: this.resultsMissing
    }
  }

  setData(library: LibraryScanLibrary, type = 'scan'): void {
    this.id = uuidv4()
    this.type = type
    this.library = library
    this.startedAt = Date.now()
  }

  setComplete(): void {
    this.finishedAt = Date.now()
    this.elapsed = this.finishedAt - this.startedAt!
  }

  addLog(level: number, ...args: unknown[]): void {
    const logObj: ScanLogEntry = {
      timestamp: this.timestamp,
      message: args.join(' '),
      levelName: Logger.getLogLevelString(level),
      level
    }

    if (this.verbose) {
      Logger.debug(`[LibraryScan] "${this.libraryName}":`, ...args)
    }
    this.logs.push(logObj)
  }

  async saveLog(): Promise<void> {
    const metadataPath = (global as typeof globalThis & { MetadataPath: string }).MetadataPath
    const scanLogDir = Path.join(metadataPath, 'logs', 'scans')

    if (!(await fs.pathExists(scanLogDir))) {
      await fs.mkdir(scanLogDir)
    }

    const outputPath = Path.join(scanLogDir, this.logFilename)
    const logLines = [JSON.stringify(this.toJSON())]
    this.logs.forEach((log) => {
      logLines.push(JSON.stringify(log))
    })
    await fs.writeFile(outputPath, logLines.join('\n') + '\n')

    Logger.info(`[LibraryScan] Scan log saved "${outputPath}"`)
  }
}

namespace LibraryScan {
  export type Library = LibraryScanLibrary
  export type Folder = LibraryScanFolder
}

export = LibraryScan
