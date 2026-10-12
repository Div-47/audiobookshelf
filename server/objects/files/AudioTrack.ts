interface AudioTrackAudioFile {
  index: number | null
  startOffset?: number | null
  duration: number | null
  metadata: { filename: string | null | undefined; clone(): InstanceType<typeof FileMetadata> }
  ino: string | null
  mimeType: string
  codec: string | null
}
const FileMetadata = require('../metadata/FileMetadata')

class AudioTrack {
  index: number | null = null
  startOffset: number | null = null
  duration: number | null = null
  title: string | null = null
  contentUrl: string | null = null
  mimeType: string | null = null
  codec: string | null = null
  metadata: InstanceType<typeof FileMetadata> | null = null

  constructor() {
    this.index = null
    this.startOffset = null
    this.duration = null
    this.title = null
    this.contentUrl = null
    this.mimeType = null
    this.codec = null
    this.metadata = null
  }

  toJSON() {
    return {
      index: this.index,
      startOffset: this.startOffset,
      duration: this.duration,
      title: this.title,
      contentUrl: this.contentUrl,
      mimeType: this.mimeType,
      codec: this.codec,
      metadata: this.metadata?.toJSON() || null
    }
  }

  setData(itemId: string, audioFile: AudioTrackAudioFile, startOffset: number): void {
    this.index = audioFile.index
    this.startOffset = startOffset
    this.duration = audioFile.duration
    this.title = audioFile.metadata.filename || ''

    this.contentUrl = `/api/items/${itemId}/file/${audioFile.ino}`
    this.mimeType = audioFile.mimeType
    this.codec = audioFile.codec || null
    this.metadata = audioFile.metadata.clone()
  }

  setFromStream(title: string, duration: number, contentUrl: string): void {
    this.index = 1
    this.startOffset = 0
    this.duration = duration
    this.title = title
    this.contentUrl = contentUrl
    this.mimeType = 'application/vnd.apple.mpegurl'
  }
}
export = AudioTrack
