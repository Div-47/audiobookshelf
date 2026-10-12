const { AudioMimeType } = require('../../utils/constants')
const AudioMetaTags = require('../metadata/AudioMetaTags')
const FileMetadata = require('../metadata/FileMetadata')

interface AudioChapter { id?: number; start: number; end?: number; title: string }
interface AudioFileData {
  index?: number | null; ino?: string | null; metadata?: ReturnType<InstanceType<typeof FileMetadata>['toJSON']>
  addedAt?: number | null; updatedAt?: number | null; trackNumFromMeta?: number | null; discNumFromMeta?: number | null
  trackNumFromFilename?: number | null; discNumFromFilename?: number | null; cdNumFromFilename?: number | null
  manuallyVerified?: boolean; exclude?: boolean; error?: string | null; format?: string | null; duration?: number | null
  bitRate?: number | string | null; language?: string | null; codec?: string | null; timeBase?: string | null
  channels?: number | null; channelLayout?: string | null; chapters?: AudioChapter[]; embeddedCoverArt?: string | null
  metaTags?: ConstructorParameters<typeof AudioMetaTags>[0]
}
interface LibraryFileInput {
  ino?: string | null
  metadata: InstanceType<typeof FileMetadata> | ConstructorParameters<typeof FileMetadata>[0]
}
interface ProbeResult {
  format: string | null; duration: number | null; bitRate: number | string | null; language: string | null
  codec: string | null; timeBase: string | null; channels: number | null; channelLayout: string | null
  chapters: AudioChapter[]; audioMetaTags: InstanceType<typeof AudioMetaTags>; embeddedCoverArt: string | null
}
const audioMimeTypes = AudioMimeType as Record<string, string>

class AudioFile {
  index: number | null | undefined = null
  ino: string | null | undefined = null
  metadata: InstanceType<typeof FileMetadata> | null = null
  addedAt: number | null | undefined = null
  updatedAt: number | null | undefined = null
  trackNumFromMeta: number | null | undefined = null
  discNumFromMeta: number | null | undefined = null
  trackNumFromFilename: number | null | undefined = null
  discNumFromFilename: number | null | undefined = null
  format: string | null | undefined = null
  duration: number | null | undefined = null
  bitRate: number | string | null | undefined = null
  language: string | null | undefined = null
  codec: string | null | undefined = null
  timeBase: string | null | undefined = null
  channels: number | null | undefined = null
  channelLayout: string | null | undefined = null
  chapters: AudioChapter[] | undefined = []
  embeddedCoverArt: string | null | undefined = null
  metaTags: InstanceType<typeof AudioMetaTags> | null = null
  manuallyVerified = false
  exclude = false
  error: string | null = null

  constructor(data?: AudioFileData | null) {
    this.index = null
    this.ino = null
    /** @type {FileMetadata} */
    this.metadata = null
    this.addedAt = null
    this.updatedAt = null

    this.trackNumFromMeta = null
    this.discNumFromMeta = null
    this.trackNumFromFilename = null
    this.discNumFromFilename = null

    this.format = null
    this.duration = null
    this.bitRate = null
    this.language = null
    this.codec = null
    this.timeBase = null
    this.channels = null
    this.channelLayout = null
    this.chapters = []
    this.embeddedCoverArt = null

    // Tags scraped from the audio file
    /** @type {AudioMetaTags} */
    this.metaTags = null

    this.manuallyVerified = false
    this.exclude = false
    this.error = null

    if (data) {
      this.construct(data)
    }
  }

  toJSON(): AudioFileData & { mimeType: string } {
    return {
      index: this.index,
      ino: this.ino,
      metadata: this.metadata.toJSON(),
      addedAt: this.addedAt,
      updatedAt: this.updatedAt,
      trackNumFromMeta: this.trackNumFromMeta,
      discNumFromMeta: this.discNumFromMeta,
      trackNumFromFilename: this.trackNumFromFilename,
      discNumFromFilename: this.discNumFromFilename,
      manuallyVerified: !!this.manuallyVerified,
      exclude: !!this.exclude,
      error: this.error || null,
      format: this.format,
      duration: this.duration,
      bitRate: this.bitRate,
      language: this.language,
      codec: this.codec,
      timeBase: this.timeBase,
      channels: this.channels,
      channelLayout: this.channelLayout,
      chapters: this.chapters,
      embeddedCoverArt: this.embeddedCoverArt,
      metaTags: this.metaTags?.toJSON() || {},
      mimeType: this.mimeType
    }
  }

  construct(data: AudioFileData): void {
    this.index = data.index
    this.ino = data.ino
    this.metadata = new FileMetadata(data.metadata || {})
    this.addedAt = data.addedAt
    this.updatedAt = data.updatedAt
    this.manuallyVerified = !!data.manuallyVerified
    this.exclude = !!data.exclude
    this.error = data.error || null

    this.trackNumFromMeta = data.trackNumFromMeta
    this.discNumFromMeta = data.discNumFromMeta
    this.trackNumFromFilename = data.trackNumFromFilename

    if (data.cdNumFromFilename !== undefined) this.discNumFromFilename = data.cdNumFromFilename // TEMP:Support old var name
    else this.discNumFromFilename = data.discNumFromFilename

    this.format = data.format
    this.duration = data.duration
    this.bitRate = data.bitRate
    this.language = data.language
    this.codec = data.codec || null
    this.timeBase = data.timeBase
    this.channels = data.channels
    this.channelLayout = data.channelLayout
    this.chapters = data.chapters
    this.embeddedCoverArt = data.embeddedCoverArt || null

    this.metaTags = new AudioMetaTags(data.metaTags || {})
  }

  get mimeType(): string {
    const format = this.metadata!.format!.toUpperCase()
    if (audioMimeTypes[format]) {
      return audioMimeTypes[format]
    } else {
      return audioMimeTypes.MP3
    }
  }

  // New scanner creates AudioFile from AudioFileScanner
  setDataFromProbe(libraryFile: LibraryFileInput, probeData: ProbeResult): void {
    this.ino = libraryFile.ino || null

    if (libraryFile.metadata instanceof FileMetadata) {
      this.metadata = libraryFile.metadata.clone()
    } else {
      this.metadata = new FileMetadata(libraryFile.metadata)
    }

    this.addedAt = Date.now()
    this.updatedAt = Date.now()

    this.format = probeData.format
    this.duration = probeData.duration
    this.bitRate = probeData.bitRate || null
    this.language = probeData.language
    this.codec = probeData.codec || null
    this.timeBase = probeData.timeBase
    this.channels = probeData.channels
    this.channelLayout = probeData.channelLayout
    this.chapters = probeData.chapters || []
    this.metaTags = probeData.audioMetaTags
    this.embeddedCoverArt = probeData.embeddedCoverArt
  }

  syncChapters(updatedChapters: AudioChapter[]): boolean {
    if (this.chapters!.length !== updatedChapters.length) {
      this.chapters = updatedChapters.map(ch => ({ ...ch }))
      return true
    } else if (updatedChapters.length === 0) {
      if (this.chapters!.length > 0) {
        this.chapters = []
        return true
      }
      return false
    }

    let hasUpdates = false
    for (let i = 0; i < updatedChapters.length; i++) {
      if (JSON.stringify(updatedChapters[i]) !== JSON.stringify(this.chapters![i])) {
        hasUpdates = true
      }
    }
    if (hasUpdates) {
      this.chapters = updatedChapters.map(ch => ({ ...ch }))
    }
    return hasUpdates
  }

  clone(): AudioFile {
    return new AudioFile(this.toJSON())
  }

  /**
   * 
   * @param {AudioFile} scannedAudioFile 
   * @returns {boolean} true if updates were made
   */
  updateFromScan(scannedAudioFile: AudioFile): boolean {
    let hasUpdated = false

    const newjson = scannedAudioFile.toJSON()
    const ignoreKeys = ['manuallyVerified', 'ctimeMs', 'addedAt', 'updatedAt']

    for (const key in newjson) {
      if (key === 'metadata') {
        if (this.metadata!.update(newjson.metadata || {})) {
          hasUpdated = true
        }
      } else if (key === 'metaTags') {
        if (!this.metaTags || !this.metaTags.isEqual(scannedAudioFile.metaTags)) {
          this.metaTags = scannedAudioFile.metaTags!.clone()
          hasUpdated = true
        }
      } else if (key === 'chapters') {
        if (this.syncChapters(newjson.chapters || [])) {
          hasUpdated = true
        }
      } else if (!ignoreKeys.includes(key) && Reflect.get(this, key) !== Reflect.get(newjson, key)) {
        Reflect.set(this, key, Reflect.get(newjson, key))
        hasUpdated = true
      }
    }
    return hasUpdated
  }
}
export = AudioFile
