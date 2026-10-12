const { LRUCache } = require('lru-cache')
const Logger = require('../Logger')
const Database = require('../Database')
import type { LRUCache as LruCache } from 'lru-cache'

interface CachedResponse {
  body: string | Buffer | undefined
  headers: NodeJS.Dict<string | string[]>
  statusCode: number
}
interface CacheRequest { query: { sort?: string }; user: { username: string }; url: string }
interface CacheResponse {
  statusCode: number
  set(headers: NodeJS.Dict<string | string[]>): this
  status(code: number): this
  send(body?: string | Buffer): unknown
  originalSend?: (body?: string | Buffer) => unknown
  getHeaders(): NodeJS.Dict<string | string[]>
}
interface HookDatabase { sequelize: { addHook(hook: string, callback: (model: unknown) => void): void } }
interface ModelNameCandidate { name?: unknown; model?: { name?: unknown }; constructor?: { name?: unknown } }
interface ApiCacheKey { user: string; url: string }

class ApiCacheManager {
  defaultCacheOptions = { max: 1000, maxSize: 10 * 1000 * 1000, sizeCalculation: (item: CachedResponse) => item.body!.length + JSON.stringify(item.headers).length }
  defaultTtlOptions: { ttl: number } = { ttl: 30 * 60 * 1000 }
  highChurnModels = new Set<string>(['session', 'mediaProgress', 'playbackSession', 'device'])
  modelsInvalidatingPersonalized = new Set<string>(['mediaProgress'])
  modelsInvalidatingMe = new Set<string>(['session', 'mediaProgress', 'playbackSession', 'device'])
  cache: LruCache<string, CachedResponse>
  ttlOptions: { ttl: number }

  constructor(cache: LruCache<string, CachedResponse> = new LRUCache(this.defaultCacheOptions), ttlOptions = this.defaultTtlOptions) {
    this.cache = cache
    this.ttlOptions = ttlOptions
  }

  init(database: HookDatabase = Database) {
    const hooks = ['afterCreate', 'afterUpdate', 'afterDestroy', 'afterBulkCreate', 'afterBulkUpdate', 'afterBulkDestroy', 'afterUpsert']
    hooks.forEach((hook) => database.sequelize.addHook(hook, (model: unknown) => this.clear(model, hook)))
  }

  getModelName(model: unknown): string {
    if (typeof model !== 'object' || model === null) return 'unknown'
    const candidate = model as ModelNameCandidate
    if (typeof candidate.name === 'string') return candidate.name
    if (typeof candidate.model?.name === 'string') return candidate.model.name
    if (typeof candidate.constructor?.name === 'string' && candidate.constructor.name !== 'Object') return candidate.constructor.name
    return 'unknown'
  }

  clearByUrlPattern(urlPattern: RegExp): number {
    let removed = 0
    for (const key of this.cache.keys()) {
      try {
        const parsed = JSON.parse(key)
        if (typeof parsed?.url === 'string' && urlPattern.test(parsed.url)) {
          if (this.cache.delete(key)) removed++
        }
      } catch {
        if (this.cache.delete(key)) removed++
      }
    }
    return removed
  }

  clearUserProgressSlices(modelName: string, hook: string): void {
    let removedPersonalized = 0
    let removedRecentEpisodes = 0
    if (this.modelsInvalidatingPersonalized.has(modelName)) {
      removedPersonalized = this.clearByUrlPattern(/^\/libraries\/[^/]+\/personalized/)
      removedRecentEpisodes = this.clearByUrlPattern(/^\/libraries\/[^/]+\/recent-episodes/)
    }
    const removedMe = this.modelsInvalidatingMe.has(modelName) ? this.clearByUrlPattern(/^\/me(\/|\?|$)/) : 0
    Logger.debug(`[ApiCacheManager] ${modelName}.${hook}: cleared user-progress cache slices (personalized=${removedPersonalized}, recentEpisodes=${removedRecentEpisodes}, me=${removedMe})`)
  }

  clear(model: unknown, hook: string): void {
    const modelName = this.getModelName(model)
    if (this.highChurnModels.has(modelName)) {
      this.clearUserProgressSlices(modelName, hook)
      return
    }

    Logger.debug(`[ApiCacheManager] ${modelName}.${hook}: Clearing cache`)
    this.cache.clear()
  }

  /**
   * Reset hooks and clear cache. Used when applying backups
   */
  reset() {
    Logger.info(`[ApiCacheManager] Resetting cache`)

    this.init()
    this.cache.clear()
  }

  get middleware(): (req: CacheRequest, res: CacheResponse, next: () => void) => void {
    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    return (req: CacheRequest, res: CacheResponse, next: () => void): void => {
      if (req.query.sort === 'random') {
        Logger.debug(`[ApiCacheManager] Skipping cache for random sort`)
        return next()
      }

      const key: ApiCacheKey = { user: req.user.username, url: req.url }
      const stringifiedKey = JSON.stringify(key)
      Logger.debug(`[ApiCacheManager] count: ${this.cache.size} size: ${this.cache.calculatedSize}`)
      const cached = this.cache.get(stringifiedKey)
      if (cached) {
        Logger.debug(`[ApiCacheManager] Cache hit: ${stringifiedKey}`)
        res.set(cached.headers)
        res.status(cached.statusCode)
        res.send(cached.body)
        return
      }
      res.originalSend = res.send
      res.send = (body?: string | Buffer) => {
        Logger.debug(`[ApiCacheManager] Cache miss: ${stringifiedKey}`)
        const cached = { body, headers: res.getHeaders(), statusCode: res.statusCode }
        if (key.url.search(/^\/libraries\/.*?\/personalized/) !== -1) {
          Logger.debug(`[ApiCacheManager] Caching with ${this.ttlOptions.ttl} ms TTL`)
          this.cache.set(stringifiedKey, cached, this.ttlOptions)
        } else {
          this.cache.set(stringifiedKey, cached)
        }
        res.originalSend!(body)
      }
      next()
    }
  }
}
module.exports = ApiCacheManager
