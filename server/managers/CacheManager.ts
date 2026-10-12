const Path = require('path')
const fs = require('../libs/fsExtra')
const stream = require('stream')
const Logger = require('../Logger')
const { resizeImage } = require('../utils/ffmpegHelpers')
const { encodeUriPath } = require('../utils/fileUtils')
const { isUUID } = require('../utils/index')
const Database = require('../Database')
import type { Response } from '../types/express'

function isValidCacheDimension(dimension: number): boolean {
  return Number.isSafeInteger(dimension) && dimension > 0
}

export interface CacheOptions {
  format?: string
  width?: number
  height?: number | null
}

class CacheManager {
  CachePath: string | null
  CoverCachePath: string | null
  ImageCachePath: string | null
  ItemCachePath: string | null

  constructor() {
    this.CachePath = null
    this.CoverCachePath = null
    this.ImageCachePath = null
    this.ItemCachePath = null
  }

  /**
   * Create cache directory paths if they dont exist
   */
  async ensureCachePaths(): Promise<void> {
    // Creates cache paths if necessary and sets owner and permissions
    this.CachePath = Path.join((global as any).MetadataPath, 'cache')
    this.CoverCachePath = Path.join(this.CachePath, 'covers')
    this.ImageCachePath = Path.join(this.CachePath, 'images')
    this.ItemCachePath = Path.join(this.CachePath, 'items')

    try {
      await fs.ensureDir(this.CachePath)
      await fs.ensureDir(this.CoverCachePath)
      await fs.ensureDir(this.ImageCachePath)
      await fs.ensureDir(this.ItemCachePath)
    } catch (error: any) {
      Logger.error(`[CacheManager] Failed to create cache directories at "${this.CachePath}": ${error.message}`)
      throw new Error(`[CacheManager] Failed to create cache directories at "${this.CachePath}"`, { cause: error })
    }
  }

  async handleCoverCache(res: Response, libraryItemId: string, options: CacheOptions = {}): Promise<any> {
    const format = options.format || 'webp'
    const width = options.width || 400
    const height = options.height || null

    if (!['webp', 'jpeg', 'png'].includes(format) || !isUUID(libraryItemId) || !isValidCacheDimension(width) || (height !== null && !isValidCacheDimension(height))) {
      return res.sendStatus(400)
    }
    res.type(`image/${format}`)

    const cachePath = Path.join(this.CoverCachePath, `${libraryItemId}_${width}${height ? `x${height}` : ''}`) + '.' + format

    // Cache exists
    if (await fs.pathExists(cachePath)) {
      if ((global as any).XAccel) {
        const encodedURI = encodeUriPath((global as any).XAccel + cachePath)
        Logger.debug(`Use X-Accel to serve static file ${encodedURI}`)
        return res.status(204).header({ 'X-Accel-Redirect': encodedURI }).send()
      }

      const r = fs.createReadStream(cachePath)
      const ps = new stream.PassThrough()
      stream.pipeline(r, ps, (err: any) => {
        if (err) {
          console.log(err)
          return res.sendStatus(500)
        }
      })
      return ps.pipe(res)
    }

    // Cached cover does not exist, generate it
    const coverPath = await Database.libraryItemModel.getCoverPath(libraryItemId)
    if (!coverPath || !(await fs.pathExists(coverPath))) {
      return res.sendStatus(404)
    }

    const writtenFile = await resizeImage(coverPath, cachePath, width, height)
    if (!writtenFile) return res.sendStatus(500)

    if ((global as any).XAccel) {
      const encodedURI = encodeUriPath((global as any).XAccel + writtenFile)
      Logger.debug(`Use X-Accel to serve static file ${encodedURI}`)
      return res.status(204).header({ 'X-Accel-Redirect': encodedURI }).send()
    }

    const readStream = fs.createReadStream(writtenFile)
    readStream.pipe(res)
  }

  purgeCoverCache(libraryItemId: string): Promise<boolean[]> {
    return this.purgeEntityCache(libraryItemId, this.CoverCachePath)
  }

  purgeImageCache(entityId: string): Promise<boolean[]> {
    return this.purgeEntityCache(entityId, this.ImageCachePath)
  }

  async purgeEntityCache(entityId: string, cachePath: string | null): Promise<boolean[]> {
    if (!entityId || !cachePath) return []
    return Promise.all(
      (await fs.readdir(cachePath)).reduce((promises: Promise<boolean>[], file: string) => {
        if (file.startsWith(entityId)) {
          Logger.debug(`[CacheManager] Going to purge ${file}`)
          promises.push(this.removeCache(Path.join(cachePath, file)))
        }
        return promises
      }, [])
    )
  }

  removeCache(path: string | null): Promise<boolean> {
    if (!path) return Promise.resolve(false)
    return fs.pathExists(path).then((exists: boolean) => {
      if (!exists) return false
      return fs
        .unlink(path)
        .then(() => true)
        .catch((err: any) => {
          Logger.error(`[CacheManager] Failed to remove cache "${path}"`, err)
          return false
        })
    })
  }

  async purgeAll(): Promise<void> {
    Logger.info(`[CacheManager] Purging all cache at "${this.CachePath}"`)
    if (this.CachePath && (await fs.pathExists(this.CachePath))) {
      await fs.remove(this.CachePath).catch((error: any) => {
        Logger.error(`[CacheManager] Failed to remove cache dir "${this.CachePath}"`, error)
      })
    }
    await this.ensureCachePaths()
  }

  async purgeItems(): Promise<void> {
    Logger.info(`[CacheManager] Purging items cache at "${this.ItemCachePath}"`)
    if (this.ItemCachePath && (await fs.pathExists(this.ItemCachePath))) {
      await fs.remove(this.ItemCachePath).catch((error: any) => {
        Logger.error(`[CacheManager] Failed to remove items cache dir "${this.ItemCachePath}"`, error)
      })
    }
    await this.ensureCachePaths()
  }

  async handleAuthorCache(res: Response, authorId: string, options: CacheOptions = {}): Promise<any> {
    const format = options.format || 'webp'
    const width = options.width || 400
    const height = options.height || null

    if (!['webp', 'jpeg', 'png'].includes(format) || !isUUID(authorId) || !isValidCacheDimension(width) || (height !== null && !isValidCacheDimension(height))) {
      return res.sendStatus(400)
    }
    res.type(`image/${format}`)

    const cachePath = Path.join(this.ImageCachePath, `${authorId}_${width}${height ? `x${height}` : ''}`) + '.' + format

    // Cache exists
    if (await fs.pathExists(cachePath)) {
      const r = fs.createReadStream(cachePath)
      const ps = new stream.PassThrough()
      stream.pipeline(r, ps, (err: any) => {
        if (err) {
          console.log(err)
          return res.sendStatus(500)
        }
      })
      return ps.pipe(res)
    }

    const author = await Database.authorModel.findByPk(authorId)
    if (!author || !author.imagePath || !(await fs.pathExists(author.imagePath))) {
      return res.sendStatus(404)
    }

    const writtenFile = await resizeImage(author.imagePath, cachePath, width, height)
    if (!writtenFile) return res.sendStatus(500)

    const readStream = fs.createReadStream(writtenFile)
    readStream.pipe(res)
  }
}

module.exports = new CacheManager()
