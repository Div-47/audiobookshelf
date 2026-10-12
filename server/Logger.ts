import util from 'util'

const { LogLevel } = require('./utils/constants')
const date = require('./libs/dateAndTime')


export interface SocketListener {
  id: string
  socket: any
  level: number
}

export interface LogObject {
  timestamp: string
  source: string
  message: string
  levelName: string
  level: number
}

export class Logger {
  logManager: any = null
  isDev: boolean = process.env.NODE_ENV !== 'production'
  logLevel: number
  socketListeners: SocketListener[] = []

  constructor() {
    this.logLevel = !this.isDev ? LogLevel.INFO : LogLevel.TRACE
  }

  /**
   * @returns {string}
   */
  get timestamp(): string {
    return date.format(new Date(), 'YYYY-MM-DD HH:mm:ss.SSS')
  }

  get levelString(): string {
    return this.getLogLevelString(this.logLevel)
  }

  /**
   * @returns {string}
   */
  get source(): string {
    const regex = (global as any).isWin ? /^.*\\([^\\:]*:[0-9]*):[0-9]*\)*/ : /^.*\/([^/:]*:[0-9]*):[0-9]*\)*/
    return (Error().stack || '').split('\n')[3]?.replace(regex, '$1') || ''
  }

  getLogLevelString(level: number): string {
    for (const key in LogLevel) {
      if ((LogLevel as any)[key] === level) {
        return key
      }
    }
    return 'UNKNOWN'
  }

  addSocketListener(socket: any, level: number): void {
    const index = this.socketListeners.findIndex((s) => s.id === socket.id)
    if (index >= 0) {
      this.socketListeners.splice(index, 1, {
        id: socket.id,
        socket,
        level
      })
    } else {
      this.socketListeners.push({
        id: socket.id,
        socket,
        level
      })
    }
  }

  removeSocketListener(socketId: string): void {
    this.socketListeners = this.socketListeners.filter((s) => s.id !== socketId)
  }

  /**
   *
   * @param {number} level
   * @param {string} levelName
   * @param {any[]} args
   * @param {string} src
   */
  async #logToFileAndListeners(level: number, levelName: string, args: any[], src: string): Promise<void> {
    const expandedArgs = args.map((arg) => (typeof arg !== 'string' ? util.inspect(arg) : arg))
    const logObj: LogObject = {
      timestamp: this.timestamp,
      source: src,
      message: expandedArgs.join(' '),
      levelName,
      level
    }

    // Emit log to sockets that are listening to log events
    this.socketListeners.forEach((socketListener) => {
      if (level >= LogLevel.FATAL || level >= socketListener.level) {
        socketListener.socket.emit('log', logObj)
      }
    })

    // Save log to file
    if (level >= LogLevel.FATAL || level >= this.logLevel) {
      await this.logManager?.logToFile(logObj)
    }
  }

  setLogLevel(level: number): void {
    this.logLevel = level
    this.debug(`Set Log Level to ${this.levelString}`)
  }

  static ConsoleMethods: Record<string, string> = {
    TRACE: 'trace',
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    FATAL: 'error',
    NOTE: 'log'
  }

  #log(levelName: string, source: string, ...args: any[]): Promise<void> | void {
    const level = (LogLevel as any)[levelName]
    if (level < LogLevel.FATAL && level < this.logLevel) return
    const consoleMethod = Logger.ConsoleMethods[levelName] as keyof Console
    ;(console as any)[consoleMethod](`[${this.timestamp}] ${levelName}:`, ...args)
    return this.#logToFileAndListeners(level, levelName, args, source)
  }

  trace(...args: any[]): void {
    this.#log('TRACE', this.source, ...args)
  }

  debug(...args: any[]): void {
    this.#log('DEBUG', this.source, ...args)
  }

  info(...args: any[]): void {
    this.#log('INFO', this.source, ...args)
  }

  warn(...args: any[]): void {
    this.#log('WARN', this.source, ...args)
  }

  error(...args: any[]): void {
    this.#log('ERROR', this.source, ...args)
  }

  fatal(...args: any[]): Promise<void> | void {
    return this.#log('FATAL', this.source, ...args)
  }

  note(...args: any[]): void {
    this.#log('NOTE', this.source, ...args)
  }
}

const loggerInstance = new Logger()
export default loggerInstance
module.exports = loggerInstance
