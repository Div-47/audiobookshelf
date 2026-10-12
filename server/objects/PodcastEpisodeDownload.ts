import type { RssPodcastEpisode } from '../utils/podcastUtils'

const Path = require('path')
const uuidv4 = require('uuid').v4
const { sanitizeFilename, filePathToPOSIX } = require('../utils/fileUtils')
const globals = require('../utils/globals')

export interface PodcastEpisodeDownloadClientJSON {
  id: string | null
  episodeDisplayTitle: string | null
  url: string | null
  libraryItemId: string | null
  libraryId: string | null
  isFinished: boolean
  failed: boolean
  appendRandomId: boolean
  startedAt: number | null
  createdAt: number | null
  finishedAt: number | null
  podcastTitle: string | null
  podcastExplicit: boolean
  season: string | null
  episode: string | null
  episodeType: string
  publishedAt: number | null
  guid: string | null
}

class PodcastEpisodeDownload {
  id: string | null
  rssPodcastEpisode: RssPodcastEpisode | null
  url: string | null
  libraryItem: any
  libraryId: string | null
  isAutoDownload: boolean
  isFinished: boolean
  failed: boolean
  appendRandomId: boolean
  targetFilename: string | null
  startedAt: number | null
  createdAt: number | null
  finishedAt: number | null

  constructor() {
    this.id = null
    this.rssPodcastEpisode = null

    this.url = null
    this.libraryItem = null
    this.libraryId = null

    this.isAutoDownload = false
    this.isFinished = false
    this.failed = false

    this.appendRandomId = false

    this.targetFilename = null

    this.startedAt = null
    this.createdAt = null
    this.finishedAt = null
  }

  toJSONForClient(): PodcastEpisodeDownloadClientJSON {
    return {
      id: this.id,
      episodeDisplayTitle: this.rssPodcastEpisode?.title ?? null,
      url: this.url,
      libraryItemId: this.libraryItemId,
      libraryId: this.libraryId || null,
      isFinished: this.isFinished,
      failed: this.failed,
      appendRandomId: this.appendRandomId,
      startedAt: this.startedAt,
      createdAt: this.createdAt,
      finishedAt: this.finishedAt,
      podcastTitle: this.libraryItem?.media?.title ?? null,
      podcastExplicit: !!this.libraryItem?.media?.explicit,
      season: this.rssPodcastEpisode?.season ?? null,
      episode: this.rssPodcastEpisode?.episode ?? null,
      episodeType: this.rssPodcastEpisode?.episodeType ?? 'full',
      publishedAt: this.rssPodcastEpisode?.publishedAt ?? null,
      guid: this.rssPodcastEpisode?.guid ?? null
    }
  }

  get urlFileExtension(): string {
    if (!this.url) return ''
    const cleanUrl = this.url.split('?')[0] // Remove query string
    return Path.extname(cleanUrl).substring(1).toLowerCase()
  }
  get fileExtension(): string {
    const extname = this.urlFileExtension
    if (globals.SupportedAudioTypes?.includes(extname)) return extname
    return 'mp3'
  }
  get enclosureType(): string | null {
    const enclosureType = this.rssPodcastEpisode?.enclosure?.type
    return typeof enclosureType === 'string' ? enclosureType : null
  }
  get episodeTitle(): string | undefined {
    return this.rssPodcastEpisode?.title
  }
  get targetPath(): string {
    return filePathToPOSIX(Path.join(this.libraryItem.path, this.targetFilename || ''))
  }
  get targetRelPath(): string | null {
    return this.targetFilename
  }
  get libraryItemId(): string | null {
    return this.libraryItem?.id || null
  }
  get pubYear(): number | null {
    if (!this.rssPodcastEpisode?.publishedAt) return null
    return new Date(this.rssPodcastEpisode.publishedAt).getFullYear()
  }

  /**
   * @param {string} title
   */
  getSanitizedFilename(title: string): string {
    const appendage = this.appendRandomId ? ` (${this.id})` : ''
    const filename = `${title.trim()}${appendage}.${this.fileExtension}`
    return sanitizeFilename(filename)
  }

  /**
   * @param {boolean} appendRandomId
   */
  setAppendRandomId(appendRandomId: boolean) {
    this.appendRandomId = appendRandomId
    this.targetFilename = this.getSanitizedFilename(this.rssPodcastEpisode?.title || '')
  }

  /**
   *
   * @param {RssPodcastEpisode} rssPodcastEpisode - from rss feed
   * @param {any} libraryItem
   * @param {boolean} isAutoDownload
   * @param {string} libraryId
   */
  setData(rssPodcastEpisode: RssPodcastEpisode, libraryItem: any, isAutoDownload: boolean, libraryId: string) {
    this.id = uuidv4()
    this.rssPodcastEpisode = rssPodcastEpisode

    const url = rssPodcastEpisode.enclosure.url
    if (decodeURIComponent(url) !== url) {
      // Already encoded
      this.url = url
    } else {
      this.url = encodeURI(url)
    }

    this.targetFilename = this.getSanitizedFilename(this.rssPodcastEpisode.title || '')

    this.libraryItem = libraryItem
    this.isAutoDownload = isAutoDownload
    this.createdAt = Date.now()
    this.libraryId = libraryId
  }

  setFinished(success: boolean) {
    this.finishedAt = Date.now()
    this.isFinished = true
    this.failed = !success
  }
}

module.exports = PodcastEpisodeDownload
