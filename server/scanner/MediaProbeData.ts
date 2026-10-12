const AudioMetaTags = require('../objects/metadata/AudioMetaTags')

interface ProbeStream {
  codec?: string | null
  bit_rate?: number | string | null
  time_base?: string | null
  language?: string | null
  channel_layout?: string | null
  channels?: number | null
  sample_rate?: number | string | null
}
interface ProbeChapter { id?: number; start?: number; end?: number; title?: string }
interface ProbeMediaInput {
  format?: string | null
  duration?: number | null
  size?: number | null
  audio_stream: ProbeStream
  video_stream?: ProbeStream | null
  bit_rate?: number | string | null
  chapters?: ProbeChapter[] | null
  tags?: Record<string, string | null | undefined>
}
interface ProbeDataInput {
  embeddedCoverArt?: string | null; format?: string | null; duration?: number | null; size?: number | null
  audioStream?: ProbeStream | null; videoStream?: ProbeStream | null; bitRate?: number | string | null
  codec?: string | null; timeBase?: string | null; language?: string | null; channelLayout?: string | null
  channels?: number | null; sampleRate?: number | string | null; chapters?: ProbeChapter[]
  audioMetaTags?: ConstructorParameters<typeof AudioMetaTags>[0]
  trackNumber?: number | null; trackTotal?: number | null; discNumber?: number | null; discTotal?: number | null
}

class MediaProbeData {
  embeddedCoverArt: string | null | undefined = null
  format: string | null | undefined = null
  duration: number | null | undefined = null
  size: number | null | undefined = null
  audioStream: ProbeStream | null | undefined = null
  videoStream: ProbeStream | null | undefined = null
  bitRate: number | string | null | undefined = null
  codec: string | null | undefined = null
  timeBase: string | null | undefined = null
  language: string | null | undefined = null
  channelLayout: string | null | undefined = null
  channels: number | null | undefined = null
  sampleRate: number | string | null | undefined = null
  chapters: ProbeChapter[] | undefined = []
  audioMetaTags: InstanceType<typeof AudioMetaTags> | null = null
  trackNumber: number | null | undefined = null
  trackTotal: number | null | undefined = null
  discNumber: number | null | undefined = null
  discTotal: number | null | undefined = null

  constructor(probeData?: ProbeDataInput | null) {
    this.embeddedCoverArt = null
    this.format = null
    this.duration = null
    this.size = null

    this.audioStream = null
    this.videoStream = null

    this.bitRate = null
    this.codec = null
    this.timeBase = null
    this.language = null
    this.channelLayout = null
    this.channels = null
    this.sampleRate = null
    this.chapters = []

    this.audioMetaTags = null

    this.trackNumber = null
    this.trackTotal = null

    this.discNumber = null
    this.discTotal = null

    if (probeData) {
      this.construct(probeData)
    }
  }

  construct(probeData: ProbeDataInput): void {
    for (const key in probeData) {
      const value = Reflect.get(probeData, key)
      if (key === 'audioMetaTags' && value) {
        this.audioMetaTags = new AudioMetaTags(value)
      } else if (Reflect.get(this, key) !== undefined) {
        Reflect.set(this, key, value)
      }
    }
  }

  setData(data: ProbeMediaInput): void {
    this.embeddedCoverArt = data.video_stream?.codec || null
    this.format = data.format
    this.duration = data.duration
    this.size = data.size

    const audioStream = data.audio_stream
    this.audioStream = audioStream
    this.videoStream = this.embeddedCoverArt ? null : data.video_stream || null

    this.bitRate = audioStream.bit_rate || data.bit_rate
    this.codec = audioStream.codec
    this.timeBase = audioStream.time_base
    this.language = audioStream.language
    this.channelLayout = audioStream.channel_layout
    this.channels = audioStream.channels
    this.sampleRate = audioStream.sample_rate
    this.chapters = data.chapters || []

    this.audioMetaTags = new AudioMetaTags()
    this.audioMetaTags.setData(data.tags || {})
  }
}
export = MediaProbeData
