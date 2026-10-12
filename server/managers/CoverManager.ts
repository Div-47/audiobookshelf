const fs = require('../libs/fsExtra')
const Path = require('path')
const Logger = require('../Logger')
const readChunk = require('../libs/readChunk')
const imageType = require('../libs/imageType')

const globals = require('../utils/globals')
const { downloadImageFile, filePathToPOSIX, checkPathIsFile } = require('../utils/fileUtils')
const { extractCoverArt } = require('../utils/ffmpegHelpers')
const parseEbookMetadata = require('../utils/parsers/parseEbookMetadata')

const CacheManager = require('../managers/CacheManager')

export interface CoverResult {
  error?: string
  cover?: string
  updated?: boolean
}

class CoverManager {
  constructor() {}

  getCoverDirectory(libraryItem: any): string {
    if ((global as any).ServerSettings.storeCoverWithItem && !libraryItem.isFile) {
      return libraryItem.path
    } else {
      return Path.posix.join(Path.posix.join((global as any).MetadataPath, 'items'), libraryItem.id)
    }
  }

  getFilesInDirectory(dir: string): string[] | Promise<string[]> {
    try {
      return fs.readdir(dir)
    } catch (error: any) {
      Logger.error(`[CoverManager] Failed to get files in dir ${dir}`, error)
      return []
    }
  }

  removeFile(filepath: string): Promise<boolean> | boolean {
    try {
      return fs.pathExists(filepath).then((exists: boolean) => {
        if (!exists) Logger.warn(`[CoverManager] Attempting to remove file that does not exist ${filepath}`)
        return exists ? fs.unlink(filepath) : false
      })
    } catch (error: any) {
      Logger.error(`[CoverManager] Failed to remove file "${filepath}"`, error)
      return false
    }
  }

  // Remove covers that dont have the same filename as the new cover
  async removeOldCovers(dirpath: string, newCoverExt: string): Promise<void> {
    const filesInDir = await this.getFilesInDirectory(dirpath)

    const imageExtensions = ['.jpeg', '.jpg', '.png', '.webp', '.jiff']
    for (let i = 0; i < filesInDir.length; i++) {
      const file = filesInDir[i]
      const _extname = Path.extname(file).toLowerCase()
      const _filename = Path.basename(file, _extname).toLowerCase()
      if (_filename === 'cover' && _extname !== newCoverExt && imageExtensions.includes(_extname)) {
        const filepath = Path.join(dirpath, file)
        Logger.debug(`[CoverManager] Removing old cover from metadata "${filepath}"`)
        await this.removeFile(filepath)
      }
    }
  }

  async checkFileIsValidImage(imagepath: string, removeOnInvalid = false): Promise<any> {
    const buffer = await readChunk(imagepath, 0, 12)
    const imgType = imageType(buffer)
    if (!imgType) {
      if (removeOnInvalid) await this.removeFile(imagepath)
      return {
        error: 'Invalid image'
      }
    }

    if (!globals.SupportedImageTypes.includes(imgType.ext)) {
      if (removeOnInvalid) await this.removeFile(imagepath)
      return {
        error: `Invalid image type ${imgType.ext} (Supported: ${globals.SupportedImageTypes.join(',')})`
      }
    }
    return imgType
  }

  async uploadCover(libraryItem: any, coverFile: any): Promise<CoverResult> {
    const extname = Path.extname(coverFile.name.toLowerCase())
    if (!extname || !globals.SupportedImageTypes.includes(extname.slice(1))) {
      return {
        error: `Invalid image type ${extname} (Supported: ${globals.SupportedImageTypes.join(',')})`
      }
    }

    const coverDirPath = this.getCoverDirectory(libraryItem)
    await fs.ensureDir(coverDirPath)

    const coverFullPath = Path.posix.join(coverDirPath, `cover${extname}`)

    // Move cover from temp upload dir to destination
    const success = await coverFile
      .mv(coverFullPath)
      .then(() => true)
      .catch((error: any) => {
        Logger.error('[CoverManager] Failed to move cover file', coverFullPath, error)
        return false
      })

    if (!success) {
      return {
        error: 'Failed to move cover into destination'
      }
    }

    await this.removeOldCovers(coverDirPath, extname)
    await CacheManager.purgeCoverCache(libraryItem.id)

    Logger.info(`[CoverManager] Uploaded libraryItem cover "${coverFullPath}" for "${libraryItem.media.title}"`)

    return {
      cover: coverFullPath
    }
  }

  async validateCoverPath(coverPath: string, libraryItem: any): Promise<CoverResult> {
    // Invalid cover path
    if (!coverPath || coverPath.startsWith('http:') || coverPath.startsWith('https:')) {
      Logger.error(`[CoverManager] validate cover path invalid http url "${coverPath}"`)
      return {
        error: 'Invalid cover path'
      }
    }
    coverPath = filePathToPOSIX(coverPath)

    // Must already have been scanned in for the library item
    const isLibraryItemFile = libraryItem.libraryFiles?.some((lf: any) => filePathToPOSIX(lf.metadata?.path) === coverPath)
    if (!isLibraryItemFile) {
      Logger.error(`[CoverManager] validate cover path is not a library item file "${coverPath}"`)
      return {
        error: 'Invalid cover path'
      }
    }

    // Cover path already set on media
    if (libraryItem.media.coverPath == coverPath) {
      Logger.debug(`[CoverManager] validate cover path already set "${coverPath}"`)
      return {
        cover: coverPath,
        updated: false
      }
    }

    // Cover path does not exist
    if (!(await fs.pathExists(coverPath))) {
      Logger.error(`[CoverManager] validate cover path does not exist "${coverPath}"`)
      return {
        error: 'Cover path does not exist'
      }
    }

    // Cover path is not a file
    if (!(await checkPathIsFile(coverPath))) {
      Logger.error(`[CoverManager] validate cover path is not a file "${coverPath}"`)
      return {
        error: 'Cover path is not a file'
      }
    }

    // Check valid image at path
    const imgtype = await this.checkFileIsValidImage(coverPath, false)
    if (imgtype.error) {
      return imgtype
    }

    const coverDirPath = this.getCoverDirectory(libraryItem)

    // Cover path is not in correct directory - make a copy
    if (!coverPath.startsWith(coverDirPath)) {
      await fs.ensureDir(coverDirPath)

      const coverFilename = `cover.${imgtype.ext}`
      const newCoverPath = Path.posix.join(coverDirPath, coverFilename)
      Logger.debug(`[CoverManager] validate cover path copy cover from "${coverPath}" to "${newCoverPath}"`)

      const copySuccess = await fs
        .copy(coverPath, newCoverPath, { overwrite: true })
        .then(() => true)
        .catch((error: any) => {
          Logger.error(`[CoverManager] validate cover path failed to copy cover`, error)
          return false
        })
      if (!copySuccess) {
        return {
          error: 'Failed to copy cover to dir'
        }
      }
      await this.removeOldCovers(coverDirPath, '.' + imgtype.ext)
      Logger.debug(`[CoverManager] cover copy success`)
      coverPath = newCoverPath
    }

    await CacheManager.purgeCoverCache(libraryItem.id)

    return {
      cover: coverPath,
      updated: true
    }
  }

  /**
   * Extract cover art from audio file and save for library item
   */
  async saveEmbeddedCoverArt(audioFiles: any[], libraryItemId: string, libraryItemPath?: string | null): Promise<string | null> {
    const audioFileWithCover = audioFiles.find((af) => af.embeddedCoverArt)
    if (!audioFileWithCover) return null

    let coverDirPath: string | null = null
    if ((global as any).ServerSettings.storeCoverWithItem && libraryItemPath) {
      coverDirPath = libraryItemPath
    } else {
      coverDirPath = Path.posix.join((global as any).MetadataPath, 'items', libraryItemId)
    }
    await fs.ensureDir(coverDirPath)

    const coverFilename = audioFileWithCover.embeddedCoverArt === 'png' ? 'cover.png' : 'cover.jpg'
    const coverFilePath = Path.join(coverDirPath, coverFilename)

    const coverAlreadyExists = await fs.pathExists(coverFilePath)
    if (coverAlreadyExists) {
      Logger.warn(`[CoverManager] Extract embedded cover art but cover already exists for "${coverFilePath}" - bail`)
      return null
    }

    const success = await extractCoverArt(audioFileWithCover.metadata.path, coverFilePath)
    if (success) {
      await CacheManager.purgeCoverCache(libraryItemId)
      return coverFilePath
    }
    return null
  }

  /**
   * Extract cover art from ebook and save for library item
   */
  async saveEbookCoverArt(ebookFileScanData: any, libraryItemId: string, libraryItemPath?: string | null): Promise<string | null> {
    if (!ebookFileScanData?.ebookCoverPath) return null

    let coverDirPath: string | null = null
    if ((global as any).ServerSettings.storeCoverWithItem && libraryItemPath) {
      coverDirPath = libraryItemPath
    } else {
      coverDirPath = Path.posix.join((global as any).MetadataPath, 'items', libraryItemId)
    }
    await fs.ensureDir(coverDirPath)

    let extname = Path.extname(ebookFileScanData.ebookCoverPath) || '.jpg'
    if (extname === '.jpeg') extname = '.jpg'
    const coverFilename = `cover${extname}`
    const coverFilePath = Path.join(coverDirPath, coverFilename)

    // TODO: Overwrite if exists?
    const coverAlreadyExists = await fs.pathExists(coverFilePath)
    if (coverAlreadyExists) {
      Logger.warn(`[CoverManager] Extract embedded cover art but cover already exists for "${coverFilePath}" - overwriting`)
    }

    const success = await parseEbookMetadata.extractCoverImage(ebookFileScanData, coverFilePath)
    if (success) {
      await CacheManager.purgeCoverCache(libraryItemId)
      return coverFilePath
    }
    return null
  }

  async downloadCoverFromUrlNew(url: string, libraryItemId: string, libraryItemPath?: string | null, forceLibraryItemFolder = false): Promise<CoverResult> {
    try {
      let coverDirPath: string
      if (((global as any).ServerSettings.storeCoverWithItem || forceLibraryItemFolder) && libraryItemPath) {
        coverDirPath = libraryItemPath
      } else {
        coverDirPath = Path.posix.join((global as any).MetadataPath, 'items', libraryItemId)
      }

      await fs.ensureDir(coverDirPath)

      const temppath = Path.posix.join(coverDirPath, 'cover')
      const success = await downloadImageFile(url, temppath)
        .then(() => true)
        .catch((err: any) => {
          Logger.error(`[CoverManager] Download image file failed for "${url}"`, err)
          return false
        })
      if (!success) {
        return {
          error: 'Failed to download image from url'
        }
      }

      const imgtype = await this.checkFileIsValidImage(temppath, true)
      if (imgtype.error) {
        return imgtype
      }

      const coverFullPath = Path.posix.join(coverDirPath, `cover.${imgtype.ext}`)
      await fs.rename(temppath, coverFullPath)

      await this.removeOldCovers(coverDirPath, '.' + imgtype.ext)
      await CacheManager.purgeCoverCache(libraryItemId)

      Logger.info(`[CoverManager] Downloaded libraryItem cover "${coverFullPath}" from url "${url}"`)
      return {
        cover: coverFullPath
      }
    } catch (error: any) {
      Logger.error(`[CoverManager] Fetch cover image from url "${url}" failed`, error)
      return {
        error: 'Failed to fetch image from url'
      }
    }
  }
}

module.exports = new CoverManager()
