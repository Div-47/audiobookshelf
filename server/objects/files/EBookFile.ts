const FileMetadata = require('../metadata/FileMetadata')

type FileMetadataInput = ReturnType<InstanceType<typeof FileMetadata>['toJSON']>
interface EbookFileData {
  ino?: string | null
  metadata: FileMetadataInput
  ebookFormat?: string | null
  addedAt?: number | null
  updatedAt?: number | null
}
interface LibraryFileLike { ino: string | null | undefined; metadata: InstanceType<typeof FileMetadata> }

class EBookFile {
  ino: string | null | undefined = null
  metadata: InstanceType<typeof FileMetadata> | null = null
  ebookFormat: string | null | undefined = null
  addedAt: number | null | undefined = null
  updatedAt: number | null | undefined = null

  constructor(file?: EbookFileData | null) {
    this.ino = null
    this.metadata = null
    this.ebookFormat = null
    this.addedAt = null
    this.updatedAt = null

    if (file) {
      this.construct(file)
    }
  }

  construct(file: EbookFileData): void {
    this.ino = file.ino
    this.metadata = new FileMetadata(file.metadata)
    this.ebookFormat = file.ebookFormat || this.metadata.format
    this.addedAt = file.addedAt
    this.updatedAt = file.updatedAt
  }

  toJSON(): EbookFileData {
    return {
      ino: this.ino,
      metadata: this.metadata.toJSON(),
      ebookFormat: this.ebookFormat,
      addedAt: this.addedAt,
      updatedAt: this.updatedAt
    }
  }

  get isEpub(): boolean {
    return this.ebookFormat === 'epub'
  }

  setData(libraryFile: LibraryFileLike): void {
    this.ino = libraryFile.ino
    this.metadata = libraryFile.metadata.clone()
    this.ebookFormat = libraryFile.metadata.format
    this.addedAt = Date.now()
    this.updatedAt = Date.now()
  }

  updateFromLibraryFile(libraryFile: LibraryFileLike): boolean {
    var hasUpdated = false

    if (this.metadata.update(libraryFile.metadata)) {
      hasUpdated = true
    }

    if (this.ebookFormat !== libraryFile.metadata.format) {
      this.ebookFormat = libraryFile.metadata.format
      hasUpdated = true
    }

    return hasUpdated
  }
}
export = EBookFile
