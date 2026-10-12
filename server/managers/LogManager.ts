const Path = require('path')
const fs = require('../libs/fsExtra')

const Logger = require('../Logger')
const DailyLog = require('../objects/DailyLog')

const { LogLevel } = require('../utils/constants')

const TAG = '[LogManager]'

export interface LogObject {
  timestamp: string
  source: string
  message: string
  levelName: string
  level: number
}
interface DailyLogLike {
  id: string
  filename: string
  logs: LogObject[]
  loadLogs(): Promise<void>
  appendLog(log: LogObject): Promise<void> | void
}
const runtimeGlobals = global as typeof globalThis & { MetadataPath: string; ServerSettings: { loggerDailyLogsToKeep?: number } }

/**
 * @typedef LogObject
 * @property {string} timestamp
 * @property {string} source
 * @property {string} message
 * @property {string} levelName
 * @property {number} level
 */

class LogManager {
  DailyLogPath: string
  ScanLogPath: string
  currentDailyLog: DailyLogLike | null
  dailyLogBuffer: LogObject[]
  dailyLogFiles: string[]

  constructor() {
    this.DailyLogPath = Path.posix.join(runtimeGlobals.MetadataPath, 'logs', 'daily')
    this.ScanLogPath = Path.posix.join(runtimeGlobals.MetadataPath, 'logs', 'scans')

    /** @type {DailyLog} */
    this.currentDailyLog = null

    /** @type {LogObject[]} */
    this.dailyLogBuffer = []

    /** @type {string[]} */
    this.dailyLogFiles = []
  }

  get loggerDailyLogsToKeep() {
    return runtimeGlobals.ServerSettings.loggerDailyLogsToKeep || 7
  }

  async ensureLogDirs() {
    try {
      await fs.ensureDir(this.DailyLogPath)
      await fs.ensureDir(this.ScanLogPath)
    } catch (error) {
      console.error(`[LogManager] Failed to create log directories at "${this.DailyLogPath}": ${error instanceof Error ? error.message : String(error)}`)
      throw new Error(`[LogManager] Failed to create log directories at "${this.DailyLogPath}"`, { cause: error })
    }
  }

  /**
   * 1. Ensure log directories exist
   * 2. Load daily log files
   * 3. Remove old daily log files
   * 4. Create/set current daily log file
   */
  async init() {
    await this.ensureLogDirs()

    // Load daily logs
    await this.scanLogFiles()

    // Check remove extra daily logs
    if (this.dailyLogFiles.length > this.loggerDailyLogsToKeep) {
      const dailyLogFilesCopy = [...this.dailyLogFiles]
      for (let i = 0; i < dailyLogFilesCopy.length - this.loggerDailyLogsToKeep; i++) {
        await this.removeLogFile(dailyLogFilesCopy[i])
      }
    }

    // set current daily log file or create if does not exist
    const currentDailyLogFilename = DailyLog.getCurrentDailyLogFilename()
    Logger.info(TAG, `Init current daily log filename: ${currentDailyLogFilename}`)

    this.currentDailyLog = new DailyLog(this.DailyLogPath)
    const currentDailyLog = this.currentDailyLog!

    if (this.dailyLogFiles.includes(currentDailyLogFilename)) {
      Logger.debug(TAG, `Daily log file already exists - set in Logger`)
      await currentDailyLog.loadLogs()
    } else {
      this.dailyLogFiles.push(currentDailyLog.filename)
    }

    // Log buffered daily logs
    if (this.dailyLogBuffer.length) {
      this.dailyLogBuffer.forEach((logObj: LogObject) => {
        currentDailyLog.appendLog(logObj)
      })
      this.dailyLogBuffer = []
    }
  }

  /**
   * Load all daily log filenames in /metadata/logs/daily
   */
  async scanLogFiles() {
    const dailyFiles = await fs.readdir(this.DailyLogPath)
    if (dailyFiles?.length) {
      dailyFiles.forEach((logFile: string) => {
        if (Path.extname(logFile) === '.txt') {
          Logger.debug('Daily Log file found', logFile)
          this.dailyLogFiles.push(logFile)
        } else {
          Logger.debug(TAG, 'Unknown File in Daily log files dir', logFile)
        }
      })
    }
    this.dailyLogFiles.sort()
  }

  /**
   *
   * @param {string} filename
   */
  async removeLogFile(filename: string): Promise<void> {
    const fullPath = Path.join(this.DailyLogPath, filename)
    const exists = await fs.pathExists(fullPath)
    if (!exists) {
      Logger.error(TAG, 'Invalid log dne ' + fullPath)
      this.dailyLogFiles = this.dailyLogFiles.filter((dlf) => dlf !== filename)
    } else {
      try {
        await fs.unlink(fullPath)
        Logger.info(TAG, 'Removed daily log: ' + filename)
        this.dailyLogFiles = this.dailyLogFiles.filter((dlf) => dlf !== filename)
      } catch (error) {
        Logger.error(TAG, 'Failed to unlink log file ' + fullPath)
      }
    }
  }

  /**
   *
   * @param {LogObject} logObj
   */
  async logToFile(logObj: LogObject): Promise<void> {
    // Fatal crashes get logged to a separate file
    if (logObj.level === LogLevel.FATAL) {
      await this.logCrashToFile(logObj)
    }

    // Buffer when logging before daily logs have been initialized
    if (!this.currentDailyLog) {
      this.dailyLogBuffer.push(logObj)
      return
    }
    let currentDailyLog = this.currentDailyLog

    // Check log rolls to next day
    if (currentDailyLog.id !== DailyLog.getCurrentDateString()) {
      currentDailyLog = new DailyLog(this.DailyLogPath)
      this.currentDailyLog = currentDailyLog
      if (this.dailyLogFiles.length > this.loggerDailyLogsToKeep) {
        // Remove oldest log
        this.removeLogFile(this.dailyLogFiles[0])
      }
    }

    // Append log line to log file
    return currentDailyLog.appendLog(logObj)
  }

  /**
   *
   * @param {LogObject} logObj
   */
  async logCrashToFile(logObj: LogObject): Promise<void> {
    const line = JSON.stringify(logObj) + '\n'

    const logsDir = Path.join(runtimeGlobals.MetadataPath, 'logs')
    await fs.ensureDir(logsDir)
    const crashLogPath = Path.join(logsDir, 'crash_logs.txt')
    return fs.writeFile(crashLogPath, line, { flag: 'a+' }).catch((error: Error) => {
      console.log('[LogManager] Appended crash log', error)
    })
  }

  /**
   * Most recent 5000 daily logs
   *
   * @returns {string}
   */
  getMostRecentCurrentDailyLogs() {
    return this.currentDailyLog?.logs.slice(-5000) || ''
  }
}
module.exports = LogManager
