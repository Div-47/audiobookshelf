const fs = require('../libs/fsExtra')
const Logger = require('../Logger')
const Path = require('path')
const Audnexus = require('../providers/Audnexus')

const { downloadImageFile } = require('../utils/fileUtils')

interface AuthorRecord { name: string; image?: string | null; [key: string]: unknown }
interface AudnexusClient {
  findAuthorByASIN(asin: string, region?: string): Promise<AuthorRecord | null> | null
  findAuthorByName(name: string, region?: string, maxLevenshtein?: number): Promise<AuthorRecord | null>
}
interface AuthorSearchOptions { maxLevenshtein?: number | string }
type ImageDownloadResult = { path: string } | { error: string }
const AudnexusProvider = Audnexus as new () => AudnexusClient
const fileSystem = fs as { pathExists(path: string): Promise<boolean>; ensureDir(path: string): Promise<void> }
const imageDownloader = downloadImageFile as (url: string, outputPath: string) => Promise<void>

class AuthorFinder {
  private audnexus: AudnexusClient
  constructor() { this.audnexus = new AudnexusProvider() }

  findAuthorByASIN(asin: string | null | undefined, region?: string): Promise<AuthorRecord | null> | null {
    if (!asin) return null
    return this.audnexus.findAuthorByASIN(asin, region)
  }

  /**
   * 
   * @param {string} name 
   * @param {string} region 
   * @param {Object} [options={}] 
   * @returns {Promise<import('../providers/Audnexus').AuthorSearchObj>}
   */
  async findAuthorByName(name: string | null | undefined, region?: string, options: AuthorSearchOptions = {}): Promise<AuthorRecord | null> {
    if (!name) return null
    const maxLevenshtein = options.maxLevenshtein !== undefined && !isNaN(Number(options.maxLevenshtein)) ? Number(options.maxLevenshtein) : 3

    const author = await this.audnexus.findAuthorByName(name, region, maxLevenshtein)
    if (!author?.name) {
      return null
    }
    return author
  }

  /**
   * Download author image from url and save in authors folder
   * 
   * @param {string} authorId 
   * @param {string} url 
   * @returns {Promise<{path:string, error:string}>}
   */
  async saveAuthorImage(authorId: string, url: string): Promise<ImageDownloadResult> {
    const authorDir = Path.join((global as typeof globalThis & { MetadataPath?: string }).MetadataPath as string, 'authors')

    if (!await fileSystem.pathExists(authorDir)) {
      await fileSystem.ensureDir(authorDir)
    }

    const imageExtension = url.toLowerCase().split('.').pop()
    const ext = imageExtension === 'png' ? 'png' : 'jpg'
    const filename = authorId + '.' + ext
    const outputPath = Path.posix.join(authorDir, filename)

    return imageDownloader(url, outputPath).then(() => {
      return {
        path: outputPath
      }
    }).catch((err) => {
      let errorMsg = err.message || 'Unknown error'
      Logger.error(`[AuthorFinder] Download image file failed for "${url}"`, errorMsg)
      return {
        error: errorMsg
      }
    })
  }
}
export = new AuthorFinder()
