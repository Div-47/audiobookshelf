interface FileMetadataValues {
  filename?: string | null | undefined
  ext?: string | null | undefined
  path?: string | null | undefined
  relPath?: string | null | undefined
  size?: number | null | undefined
  mtimeMs?: number | null | undefined
  ctimeMs?: number | null | undefined
  birthtimeMs?: number | null | undefined
}

class FileMetadata {
  filename: string | null | undefined = null
  ext: string | null | undefined = null
  path: string | null | undefined = null
  relPath: string | null | undefined = null
  size: number | null | undefined = null
  mtimeMs: number | null | undefined = null
  ctimeMs: number | null | undefined = null
  birthtimeMs: number | null | undefined = null
  wasModified = false

  constructor(metadata?: FileMetadataValues | null) {
    if (metadata) {
      this.construct(metadata)
    }

    // Temp flag used in scans
  }

  construct(metadata: FileMetadataValues): void {
    this.filename = metadata.filename
    this.ext = metadata.ext
    this.path = metadata.path
    this.relPath = metadata.relPath
    this.size = metadata.size
    this.mtimeMs = metadata.mtimeMs
    this.ctimeMs = metadata.ctimeMs
    this.birthtimeMs = metadata.birthtimeMs
  }

  toJSON(): FileMetadataValues {
    return {
      filename: this.filename,
      ext: this.ext,
      path: this.path,
      relPath: this.relPath,
      size: this.size,
      mtimeMs: this.mtimeMs,
      ctimeMs: this.ctimeMs,
      birthtimeMs: this.birthtimeMs
    }
  }

  clone() {
    return new FileMetadata(this.toJSON())
  }

  get format() {
    if (!this.ext) return ''
    return this.ext.slice(1).toLowerCase()
  }
  get filenameNoExt() {
    return (this.filename as string).replace(this.ext as string, '')
  }

  update(payload: Partial<FileMetadataValues>): boolean {
    var hasUpdates = false
    for (const key in payload) {
      if (Reflect.get(this, key) !== undefined && Reflect.get(this, key) !== Reflect.get(payload, key)) {
        Reflect.set(this, key, Reflect.get(payload, key))
        hasUpdates = true
      }
    }
    return hasUpdates
  }

  setData(payload: Partial<FileMetadataValues>): void {
    for (const key in payload) {
      if (Reflect.get(this, key) !== undefined) {
        Reflect.set(this, key, Reflect.get(payload, key))
      }
    }
  }
}
export = FileMetadata
