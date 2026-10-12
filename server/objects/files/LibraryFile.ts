const Path = require('path')
const { getFileTimestampsWithIno, filePathToPOSIX } = require('../../utils/fileUtils')
const globals = require('../../utils/globals')
const FileMetadata = require('../metadata/FileMetadata')

type FileMetadataInput = ReturnType<InstanceType<typeof FileMetadata>['toJSON']>
interface LibraryFileData {
  ino?: string | null
  metadata: FileMetadataInput
  isSupplementary?: boolean | null
  addedAt?: number | null
  updatedAt?: number | null
  fileType?: FileType
}
type FileType = 'image' | 'audio' | 'ebook' | 'text' | 'metadata' | 'unknown'
interface FileTimestamps extends FileMetadataInput { ino: string }
interface FileUtils {
  getFileTimestampsWithIno(path: string): Promise<FileTimestamps | false>
  filePathToPOSIX(path: string): string
}
interface SupportedFileTypes {
  SupportedImageTypes: string[]
  SupportedAudioTypes: string[]
  SupportedEbookTypes: string[]
  TextFileTypes: string[]
  MetadataFileTypes: string[]
}
const fileUtils = require('../../utils/fileUtils') as FileUtils
const supportedFileTypes = globals as SupportedFileTypes

class LibraryFile {
  ino: string | null | undefined = null
  metadata: InstanceType<typeof FileMetadata> | null = null
  isSupplementary: boolean | null = null
  addedAt: number | null | undefined = null
  updatedAt: number | null | undefined = null

  constructor(file?: LibraryFileData | null) {
    this.ino = null
    this.metadata = null
    this.isSupplementary = null
    this.addedAt = null
    this.updatedAt = null

    if (file) {
      this.construct(file)
    }
  }

  construct(file: LibraryFileData): void {
    this.ino = file.ino
    this.metadata = new FileMetadata(file.metadata)
    this.isSupplementary = file.isSupplementary === undefined ? null : file.isSupplementary
    this.addedAt = file.addedAt
    this.updatedAt = file.updatedAt
  }

  toJSON(): LibraryFileData & { fileType: FileType } {
    return {
      ino: this.ino,
      metadata: this.metadata.toJSON(),
      isSupplementary: this.isSupplementary,
      addedAt: this.addedAt,
      updatedAt: this.updatedAt,
      fileType: this.fileType
    }
  }

  clone(): LibraryFile {
    return new LibraryFile(this.toJSON())
  }

  get fileType(): FileType {
    if (supportedFileTypes.SupportedImageTypes.includes(this.metadata!.format)) return 'image'
    if (supportedFileTypes.SupportedAudioTypes.includes(this.metadata!.format)) return 'audio'
    if (supportedFileTypes.SupportedEbookTypes.includes(this.metadata!.format)) return 'ebook'
    if (supportedFileTypes.TextFileTypes.includes(this.metadata!.format)) return 'text'
    if (supportedFileTypes.MetadataFileTypes.includes(this.metadata!.format)) return 'metadata'
    return 'unknown'
  }

  get isMediaFile(): boolean {
    return this.fileType === 'audio' || this.fileType === 'ebook'
  }

  get isEBookFile(): boolean {
    return this.fileType === 'ebook'
  }

  get isOPFFile(): boolean {
    return this.metadata.ext === '.opf'
  }

  async setDataFromPath(path: string, relPath: string): Promise<void> {
    var fileTsData = await fileUtils.getFileTimestampsWithIno(path)
    var fileMetadata = new FileMetadata()
    fileMetadata.setData(fileTsData || {})
    fileMetadata.filename = Path.basename(relPath)
    fileMetadata.path = fileUtils.filePathToPOSIX(path)
    fileMetadata.relPath = fileUtils.filePathToPOSIX(relPath)
    fileMetadata.ext = Path.extname(relPath)
    this.ino = fileTsData ? fileTsData.ino : undefined
    this.metadata = fileMetadata
    this.addedAt = Date.now()
    this.updatedAt = Date.now()
  }
}
export = LibraryFile
