import Path from 'path'
import os from 'os'
import Logger from '../Logger'

const { isWritable } = require('./fileUtils')


const unrar = require('node-unrar-js')
const fs = require('../libs/fsExtra')
const StreamZip = require('../libs/nodeStreamZip')
const Archive = require('../libs/libarchive/archive')
const { sanitizePath } = require('../libs/archiver/archiverUtils')

/**
 * Sanitize a path from an archive
 *
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeArchivePath(filename: string): string {
  const sanitizedPath = Path.normalize(sanitizePath(filename))
  if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '..' || sanitizedPath.startsWith(`..${Path.sep}`) || Path.isAbsolute(sanitizedPath)) {
    throw new Error(`[CbrComicBookExtractor] Unsafe archive path "${filename}"`)
  }
  return sanitizedPath
}

export abstract class AbstractComicBookExtractor {
  comicPath: string

  constructor(comicPath: string) {
    this.comicPath = comicPath
  }

  async getBuffer(): Promise<Buffer | null> {
    if (!(await fs.pathExists(this.comicPath))) {
      Logger.error(`[parseComicMetadata] Comic path does not exist "${this.comicPath}"`)
      return null
    }
    try {
      return fs.readFile(this.comicPath)
    } catch (error) {
      Logger.error(`[parseComicMetadata] Failed to read comic at "${this.comicPath}"`, error)
      return null
    }
  }

  abstract open(): Promise<void>
  abstract getFilePaths(): Promise<string[] | null>
  abstract extractToFile(filePath: string, outputFilePath: string): Promise<boolean>
  abstract extractToBuffer(filePath: string): Promise<Buffer | null>
  abstract close(): void
}

export class CbrComicBookExtractor extends AbstractComicBookExtractor {
  archive: any = null
  tmpDir: string | null = null

  constructor(comicPath: string) {
    super(comicPath)
    this.archive = null
    this.tmpDir = null
  }

  async open(): Promise<void> {
    this.tmpDir = (global as any).MetadataPath ? Path.join((global as any).MetadataPath, 'tmp') : os.tmpdir()
    await fs.ensureDir(this.tmpDir)
    if (!(await isWritable(this.tmpDir))) throw new Error(`[CbrComicBookExtractor] Temp directory "${this.tmpDir}" is not writable`)
    this.archive = await unrar.createExtractorFromFile({
      filepath: this.comicPath,
      targetPath: this.tmpDir,
      filenameTransform: sanitizeArchivePath
    })
    Logger.debug(`[CbrComicBookExtractor] Opened comic book "${this.comicPath}". Using temp directory "${this.tmpDir}" for extraction.`)
  }

  async getFilePaths(): Promise<string[] | null> {
    if (!this.archive) return null
    const list = this.archive.getFileList()
    const fileHeaders = [...list.fileHeaders]
    const filePaths = fileHeaders.filter((fh: any) => !fh.flags.directory).map((fh: any) => fh.name)
    Logger.debug(`[CbrComicBookExtractor] Found ${filePaths.length} files in comic book "${this.comicPath}"`)
    return filePaths
  }

  async removeEmptyParentDirs(file: string): Promise<void> {
    let dir = Path.dirname(file)
    while (dir !== '.') {
      const fullDirPath = Path.join(this.tmpDir!, dir)
      const files = await fs.readdir(fullDirPath)
      if (files.length > 0) break
      await fs.remove(fullDirPath)
      dir = Path.dirname(dir)
    }
  }

  getExtractedFilePath(file: string): { filePath: string; relativePath: string } {
    const sanitizedFile = sanitizeArchivePath(file)
    return {
      filePath: Path.join(this.tmpDir!, sanitizedFile),
      relativePath: sanitizedFile
    }
  }

  async extractToBuffer(file: string): Promise<Buffer | null> {
    if (!this.archive) return null
    const extracted = this.archive.extract({ files: [file] })
    const files = [...extracted.files]
    const { filePath, relativePath } = this.getExtractedFilePath(files[0].fileHeader.name)
    const fileData = await fs.readFile(filePath)
    await fs.remove(filePath)
    await this.removeEmptyParentDirs(relativePath)
    Logger.debug(`[CbrComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to buffer, size: ${fileData.length}`)
    return fileData
  }

  async extractToFile(file: string, outputFilePath: string): Promise<boolean> {
    if (!this.archive) return false
    const extracted = this.archive.extract({ files: [file] })
    const files = [...extracted.files]
    const { filePath: extractedFilePath, relativePath } = this.getExtractedFilePath(files[0].fileHeader.name)
    await fs.move(extractedFilePath, outputFilePath, { overwrite: true })
    await this.removeEmptyParentDirs(relativePath)
    Logger.debug(`[CbrComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to "${outputFilePath}"`)
    return true
  }

  close(): void {
    Logger.debug(`[CbrComicBookExtractor] Closed comic book "${this.comicPath}"`)
  }
}

export class CbzComicBookExtractor extends AbstractComicBookExtractor {
  archive: any = null

  constructor(comicPath: string) {
    super(comicPath)
    this.archive = null
  }

  async open(): Promise<void> {
    const buffer = await this.getBuffer()
    this.archive = await Archive.open(buffer)
    Logger.debug(`[CbzComicBookExtractor] Opened comic book "${this.comicPath}"`)
  }

  async getFilePaths(): Promise<string[] | null> {
    if (!this.archive) return null
    const list = await this.archive.getFilesArray()
    const fileNames = list.map((fo: any) => fo.file._path)
    Logger.debug(`[CbzComicBookExtractor] Found ${fileNames.length} files in comic book "${this.comicPath}"`)
    return fileNames
  }

  async extractToBuffer(file: string): Promise<Buffer | null> {
    if (!this.archive) return null
    const extracted = await this.archive.extractSingleFile(file)
    Logger.debug(`[CbzComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to buffer, size: ${extracted?.fileData.length}`)
    return extracted?.fileData || null
  }

  async extractToFile(file: string, outputFilePath: string): Promise<boolean> {
    const data = await this.extractToBuffer(file)
    if (!data) return false
    await fs.writeFile(outputFilePath, data)
    Logger.debug(`[CbzComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to "${outputFilePath}"`)
    return true
  }

  close(): void {
    this.archive?.close()
    Logger.debug(`[CbzComicBookExtractor] Closed comic book "${this.comicPath}"`)
  }
}

export class CbzStreamZipComicBookExtractor extends AbstractComicBookExtractor {
  archive: any = null

  constructor(comicPath: string) {
    super(comicPath)
    this.archive = null
  }

  async open(): Promise<void> {
    this.archive = new StreamZip.async({ file: this.comicPath })
    Logger.debug(`[CbzStreamZipComicBookExtractor] Opened comic book "${this.comicPath}"`)
  }

  async getFilePaths(): Promise<string[] | null> {
    if (!this.archive) return null
    const entries = await this.archive.entries()
    const fileNames = Object.keys(entries).filter((entry) => !entries[entry].isDirectory)
    Logger.debug(`[CbzStreamZipComicBookExtractor] Found ${fileNames.length} files in comic book "${this.comicPath}"`)
    return fileNames
  }

  async extractToBuffer(file: string): Promise<Buffer | null> {
    if (!this.archive) return null
    const extracted = await this.archive?.entryData(file)
    Logger.debug(`[CbzStreamZipComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to buffer, size: ${extracted?.length}`)
    return extracted || null
  }

  async extractToFile(file: string, outputFilePath: string): Promise<boolean> {
    if (!this.archive) return false
    try {
      await this.archive.extract(file, outputFilePath)
      Logger.debug(`[CbzStreamZipComicBookExtractor] Extracted file "${file}" from comic book "${this.comicPath}" to "${outputFilePath}"`)
      return true
    } catch (error) {
      Logger.error(`[CbzStreamZipComicBookExtractor] Failed to extract file "${file}" to "${outputFilePath}"`, error)
      return false
    }
  }

  close(): void {
    this.archive
      ?.close()
      .then(() => {
        Logger.debug(`[CbzStreamZipComicBookExtractor] Closed comic book "${this.comicPath}"`)
      })
      .catch((error: any) => {
        Logger.error(`[CbzStreamZipComicBookExtractor] Failed to close comic book "${this.comicPath}"`, error)
      })
  }
}

export function createComicBookExtractor(comicPath: string): AbstractComicBookExtractor {
  const ext = Path.extname(comicPath).toLowerCase()
  if (ext === '.cbr') {
    return new CbrComicBookExtractor(comicPath)
  } else if (ext === '.cbz') {
    return new CbzStreamZipComicBookExtractor(comicPath)
  } else {
    throw new Error(`Unsupported comic book format "${ext}"`)
  }
}

module.exports = { createComicBookExtractor }
