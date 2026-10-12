const axios = require('axios')
const ssrfFilter = require('ssrf-req-filter')
const Logger = require('../Logger')
const { xmlToJSON, timestampToSeconds } = require('./index')
const htmlSanitizer = require('../utils/htmlSanitizer')
const Fuse = require('../libs/fusejs')

export interface RssPodcastChapter {
  id: number
  title: string
  start: number
  end: number
}

export interface RssPodcastEpisode {
  title: string
  subtitle: string
  description: string
  descriptionPlain: string
  pubDate: string
  episodeType: string
  season: string
  episode: string
  author: string
  duration: string
  durationSeconds: number | null
  explicit: string
  publishedAt: number | null
  enclosure: { url: string; type?: string; length?: string }
  guid: string | null
  chaptersUrl: string | null
  chaptersType: string | null
  chapters: RssPodcastChapter[]
}

export interface RssPodcastMetadata {
  title?: string
  language?: string
  explicit?: string
  author?: string
  pubDate?: string
  link?: string
  image: string | null
  categories: string[]
  feedUrl: string | null
  description: string | null
  descriptionPlain: string | null
  type: string | null
  [key: string]: unknown
}

export interface RssPodcast {
  metadata: RssPodcastMetadata
  episodes?: RssPodcastEpisode[]
  numEpisodes?: number
}

function extractFirstArrayItem(json: Record<string, unknown>, key: string): unknown {
  const arr = json[key] as unknown[] | undefined
  if (!arr?.length) return null
  return arr[0]
}

function extractStringOrStringify(json: Record<string, unknown>): string {
  try {
    const firstKey = Object.keys(json)[0]
    const val = (json[firstKey] as unknown[])?.[0]
    if (typeof val === 'string') {
      return val
    }
    // Handles case where html was included without being wrapped in CDATA
    return JSON.stringify(json)
  } catch {
    return ''
  }
}

function extractFirstArrayItemString(json: Record<string, unknown>, key: string): string {
  const item = extractFirstArrayItem(json, key)
  if (!item) return ''
  if (typeof item === 'object') {
    const itemObj = item as Record<string, unknown>
    if (itemObj?.['_'] && typeof itemObj['_'] === 'string') return itemObj['_']

    return extractStringOrStringify(itemObj)
  }
  return typeof item === 'string' ? item : ''
}

function extractImage(channel: Record<string, unknown>): string | null {
  const image = channel.image as { url?: string[] } | undefined
  if (!image || !image.url || !image.url.length) {
    const itunesImage = channel['itunes:image'] as Array<{ $: { href?: string } }> | undefined
    if (!itunesImage || !itunesImage.length || !itunesImage[0]['$']) {
      return null
    }
    return itunesImage[0]['$'].href || null
  }
  return image.url[0] || null
}

function extractCategories(channel: Record<string, unknown>): string[] {
  const categories = channel['itunes:category'] as Array<{ $: { text?: string }; 'itunes:category'?: unknown }> | undefined
  if (!categories || !categories.length) return []
  let cleanedCats: string[] = []
  categories.forEach((cat) => {
    if (!cat['$'] || !cat['$'].text) return
    const cattext = cat['$'].text
    if (cat['itunes:category']) {
      const subcats = extractCategories(cat as Record<string, unknown>)
      if (subcats.length) {
        cleanedCats = cleanedCats.concat(subcats.map((subcat) => `${cattext}:${subcat}`))
      } else {
        cleanedCats.push(cattext)
      }
    } else {
      cleanedCats.push(cattext)
    }
  })
  return cleanedCats
}

function extractPodcastMetadata(channel: Record<string, unknown>): RssPodcastMetadata {
  const metadata: RssPodcastMetadata = {
    image: extractImage(channel),
    categories: extractCategories(channel),
    feedUrl: null,
    description: null,
    descriptionPlain: null,
    type: null
  }

  if (channel['itunes:new-feed-url']) {
    metadata.feedUrl = extractFirstArrayItem(channel, 'itunes:new-feed-url') as string
  } else if (channel['atom:link'] && (channel['atom:link'] as Array<{ $: { href?: string } }>).length && (channel['atom:link'] as Array<{ $: { href?: string } }>)[0]['$']) {
    metadata.feedUrl = (channel['atom:link'] as Array<{ $: { href?: string } }>)[0]['$'].href || null
  }

  if (channel['description']) {
    const rawDescription = extractFirstArrayItemString(channel, 'description')
    metadata.description = htmlSanitizer.sanitize(rawDescription.trim())
    metadata.descriptionPlain = htmlSanitizer.stripAllTags(rawDescription.trim())
  }

  const arrayFields = ['title', 'language', 'itunes:explicit', 'itunes:author', 'pubDate', 'link', 'itunes:type']
  arrayFields.forEach((key) => {
    const cleanKey = key.split(':').pop()!
    let value = extractFirstArrayItem(channel, key) as string | Record<string, unknown> | null
    if (value && typeof value === 'object' && value['_']) value = value['_'] as string
    metadata[cleanKey] = value
  })
  return metadata
}

function extractEpisodeData(item: Record<string, unknown>): Record<string, unknown> | null {
  // Episode must have url
  let enclosure: { url: string; type?: string; length?: string } | undefined

  const itemEnclosure = item.enclosure as Array<{ $: { url: string; type?: string; length?: string } }> | undefined
  const mediaContent = item['media:content'] as Array<{ $: { url: string; type?: string } }> | undefined

  if (itemEnclosure?.[0]?.['$']?.url) {
    enclosure = itemEnclosure[0]['$']
  } else if (mediaContent?.find((c) => c?.['$']?.url && (c?.['$']?.type ?? '').startsWith('audio'))) {
    enclosure = mediaContent.find((c) => (c['$']?.type ?? '').startsWith('audio'))!['$']
  } else {
    Logger.error(`[podcastUtils] Invalid podcast episode data`)
    return null
  }

  const episode: Record<string, unknown> = {
    enclosure: enclosure
  }

  enclosure.url = enclosure.url.trim()

  // Full description with html
  if (item['content:encoded']) {
    const rawDescription = (extractFirstArrayItemString(item, 'content:encoded') || '').trim()
    episode.description = htmlSanitizer.sanitize(rawDescription)
  }

  // Extract chapters
  const podcastChapters = item['podcast:chapters'] as Array<{ $: { url?: string; type?: string } }> | undefined
  if (podcastChapters?.[0]?.['$']?.url) {
    episode.chaptersUrl = podcastChapters[0]['$'].url
    episode.chaptersType = podcastChapters[0]['$'].type || 'application/json'
  }

  // Supposed to be the plaintext description but not always followed
  if (item['description']) {
    const rawDescription = extractFirstArrayItemString(item, 'description')

    if (!episode.description) episode.description = htmlSanitizer.sanitize(rawDescription.trim())
    episode.descriptionPlain = htmlSanitizer.stripAllTags(rawDescription.trim())
  }

  if (item['pubDate']) {
    const pubDate = extractFirstArrayItem(item, 'pubDate')
    if (typeof pubDate === 'string') {
      episode.pubDate = pubDate
    } else if (typeof (pubDate as { _?: string })?._ === 'string') {
      episode.pubDate = (pubDate as { _?: string })._
    } else {
      Logger.error(`[podcastUtils] Invalid pubDate ${item['pubDate']} for ${enclosure.url}`)
    }
  }

  if (item['guid']) {
    const guidItem = extractFirstArrayItem(item, 'guid')
    if (typeof guidItem === 'string') {
      episode.guid = guidItem
    } else if (typeof (guidItem as { _?: string })?._ === 'string') {
      episode.guid = (guidItem as { _?: string })._
    } else {
      Logger.error(`[podcastUtils] Invalid guid for ${enclosure.url}`, item['guid'])
    }
  }

  const arrayFields = ['title', 'itunes:episodeType', 'itunes:season', 'itunes:episode', 'itunes:author', 'itunes:duration', 'itunes:explicit', 'itunes:subtitle']
  arrayFields.forEach((key) => {
    const cleanKey = key.split(':').pop()!
    episode[cleanKey] = extractFirstArrayItemString(item, key)
  })

  if (episode.subtitle && typeof episode.subtitle === 'string') {
    episode.subtitle = htmlSanitizer.sanitize(episode.subtitle.trim())
  }

  // Extract psc:chapters if duration is set
  episode.durationSeconds = episode.duration && typeof episode.duration === 'string' ? timestampToSeconds(episode.duration) : null

  const pscChapters = item['psc:chapters'] as Array<{ 'psc:chapter'?: Array<{ $: { title?: string; start?: string } }> }> | undefined
  if (pscChapters?.[0]?.['psc:chapter']?.length && episode.durationSeconds) {
    const cleanedChapters = pscChapters[0]['psc:chapter'].map((chapter, index) => {
      if (!chapter['$']?.title || !chapter['$']?.start || typeof chapter['$']?.start !== 'string' || typeof chapter['$']?.title !== 'string') {
        return null
      }

      const start = timestampToSeconds(chapter['$'].start)
      if (start === null) {
        return null
      }

      return {
        id: index,
        title: chapter['$'].title,
        start
      }
    })

    if (cleanedChapters.some((chapter) => !chapter)) {
      Logger.warn(`[podcastUtils] Invalid chapter data for ${enclosure.url}`)
    } else {
      episode.chapters = cleanedChapters.map((chapter, index) => {
        const nextChapter = cleanedChapters[index + 1]
        const end = nextChapter ? nextChapter.start : (episode.durationSeconds as number)
        return {
          id: chapter!.id,
          title: chapter!.title,
          start: chapter!.start,
          end
        }
      })
    }
  }

  return episode
}

function cleanEpisodeData(data: Record<string, unknown>): RssPodcastEpisode {
  const pubJsDate = data.pubDate ? new Date(data.pubDate as string) : null
  const publishedAt = pubJsDate && !isNaN(pubJsDate.getTime()) ? pubJsDate.valueOf() : null

  return {
    title: (data.title as string) || '',
    subtitle: (data.subtitle as string) || '',
    description: (data.description as string) || '',
    descriptionPlain: (data.descriptionPlain as string) || '',
    pubDate: (data.pubDate as string) || '',
    episodeType: (data.episodeType as string) || '',
    season: (data.season as string) || '',
    episode: (data.episode as string) || '',
    author: (data.author as string) || '',
    duration: (data.duration as string) || '',
    durationSeconds: (data.durationSeconds as number | null) || null,
    explicit: (data.explicit as string) || '',
    publishedAt,
    enclosure: data.enclosure as { url: string; type?: string; length?: string },
    guid: (data.guid as string) || null,
    chaptersUrl: (data.chaptersUrl as string) || null,
    chaptersType: (data.chaptersType as string) || null,
    chapters: (data.chapters as RssPodcastChapter[]) || []
  }
}

function extractPodcastEpisodes(items: Array<Record<string, unknown>>): RssPodcastEpisode[] {
  const episodes: RssPodcastEpisode[] = []
  items.forEach((item) => {
    const extracted = extractEpisodeData(item)
    if (extracted) {
      episodes.push(cleanEpisodeData(extracted))
    }
  })
  return episodes
}

function cleanPodcastJson(rssJson: Record<string, unknown>, excludeEpisodeMetadata: boolean): RssPodcast | null {
  const channelList = rssJson.channel as Array<Record<string, unknown>> | undefined
  if (!channelList?.length) {
    Logger.error(`[podcastUtil] Invalid podcast no channel object`)
    return null
  }
  const channel = channelList[0]
  const items = channel.item as Array<Record<string, unknown>> | undefined
  if (!items?.length) {
    Logger.error(`[podcastUtil] Invalid podcast no episodes`)
    return null
  }
  const podcast: RssPodcast = {
    metadata: extractPodcastMetadata(channel)
  }
  if (!excludeEpisodeMetadata) {
    podcast.episodes = extractPodcastEpisodes(items)
  } else {
    podcast.numEpisodes = items.length
  }
  return podcast
}

export async function parsePodcastRssFeedXml(xml: string, excludeEpisodeMetadata = false, includeRaw = false): Promise<{ podcast: RssPodcast; rawJson?: Record<string, unknown> } | null> {
  if (!xml) return null
  const json = await xmlToJSON(xml)
  if (!json?.rss) {
    Logger.error('[podcastUtils] Invalid XML or RSS feed')
    return null
  }

  const podcast = cleanPodcastJson(json.rss as Record<string, unknown>, excludeEpisodeMetadata)
  if (!podcast) return null

  if (includeRaw) {
    return {
      podcast,
      rawJson: json
    }
  } else {
    return {
      podcast
    }
  }
}

/**
 * Get podcast RSS feed as JSON
 * Uses SSRF filter to prevent internal URLs
 *
 * @param {string} feedUrl
 * @param {boolean} [excludeEpisodeMetadata=false]
 * @returns {Promise<RssPodcast|null>}
 */
export async function getPodcastFeed(feedUrl: string, excludeEpisodeMetadata = false): Promise<RssPodcast | null> {
  Logger.debug(`[podcastUtils] getPodcastFeed for "${feedUrl}"`)

  let userAgent = 'audiobookshelf (+https://audiobookshelf.org; like iTMS)'
  // Workaround for CBC RSS feeds rejecting our user agent string
  // See: https://github.com/advplyr/audiobookshelf/issues/3322
  if (feedUrl.startsWith('https://www.cbc.ca')) {
    userAgent = 'audiobookshelf (+https://audiobookshelf.org; like iTMS) - CBC'
  }

  return axios({
    url: feedUrl,
    method: 'GET',
    timeout: (global as unknown as { PodcastDownloadTimeout?: number }).PodcastDownloadTimeout,
    responseType: 'arraybuffer',
    headers: {
      Accept: 'application/rss+xml, application/xhtml+xml, application/xml, */*;q=0.8',
      'Accept-Encoding': 'gzip, compress, deflate',
      'User-Agent': userAgent
    },
    httpAgent: (global as unknown as { DisableSsrfRequestFilter?: (url: string) => boolean }).DisableSsrfRequestFilter?.(feedUrl) ? null : ssrfFilter(feedUrl),
    httpsAgent: (global as unknown as { DisableSsrfRequestFilter?: (url: string) => boolean }).DisableSsrfRequestFilter?.(feedUrl) ? null : ssrfFilter(feedUrl)
  })
    .then(async (data: { headers?: Record<string, string>; data?: Buffer | string }) => {
      // Adding support for ios-8859-1 encoded RSS feeds.
      //  See: https://github.com/advplyr/audiobookshelf/issues/1489
      const contentType = data.headers?.['content-type'] || '' // e.g. text/xml; charset=iso-8859-1
      let rawData: string
      if (Buffer.isBuffer(data.data)) {
        if (contentType.toLowerCase().includes('iso-8859-1')) {
          rawData = data.data.toString('latin1')
        } else {
          rawData = data.data.toString()
        }
      } else {
        rawData = (data.data || '') as string
      }

      if (!rawData) {
        Logger.error(`[podcastUtils] getPodcastFeed: Invalid podcast feed request response (${feedUrl})`)
        return null
      }
      Logger.debug(`[podcastUtils] getPodcastFeed for "${feedUrl}" success - parsing xml`)
      const payload = await parsePodcastRssFeedXml(rawData, excludeEpisodeMetadata)
      if (!payload) {
        return null
      }

      // RSS feed may be a private RSS feed
      payload.podcast.metadata.feedUrl = feedUrl

      return payload.podcast
    })
    .catch((error: { code?: string; cause?: { code?: string }; request?: { _options?: { protocol?: string; href?: string } } }) => {
      // Check for failures due to redirecting from http to https. If original url was http, upgrade to https and try again
      if (error.code === 'ERR_FR_REDIRECTION_FAILURE' && error.cause?.code === 'ERR_INVALID_PROTOCOL') {
        if (feedUrl.startsWith('http://') && error.request?._options?.protocol === 'https:') {
          Logger.info('Redirection from http to https detected. Upgrading Request', error.request._options.href)
          feedUrl = feedUrl.replace('http://', 'https://')
          return getPodcastFeed(feedUrl, excludeEpisodeMetadata)
        }
      }
      Logger.error('[podcastUtils] getPodcastFeed Error', error)
      return null
    })
}

// Return array of episodes ordered by closest match using fuse.js
export async function findMatchingEpisodes(feedUrl: string, searchTitle: string): Promise<Array<{ episode: RssPodcastEpisode }> | null> {
  const feed = await getPodcastFeed(feedUrl).catch(() => {
    return null
  })

  return findMatchingEpisodesInFeed(feed, searchTitle)
}

/**
 *
 * @param {RssPodcast | null} feed
 * @param {string} searchTitle
 * @param {number} [threshold=0.4] - 0.0 for perfect match, 1.0 for match anything
 * @returns {Array<{ episode: RssPodcastEpisode }> | null}
 */
export function findMatchingEpisodesInFeed(feed: RssPodcast | null, searchTitle: string, threshold = 0.4): Array<{ episode: RssPodcastEpisode }> | null {
  if (!feed?.episodes) {
    return null
  }

  const fuseOptions = {
    ignoreDiacritics: true,
    threshold,
    keys: [
      { name: 'title', weight: 0.7 }, // prefer match in title
      { name: 'subtitle', weight: 0.3 }
    ]
  }
  const fuse = new Fuse(feed.episodes, fuseOptions)

  const matches: Array<{ episode: RssPodcastEpisode }> = []
  fuse.search(searchTitle).forEach((match: { item: RssPodcastEpisode }) => {
    matches.push({
      episode: match.item
    })
  })
  return matches
}

module.exports = {
  parsePodcastRssFeedXml,
  getPodcastFeed,
  findMatchingEpisodes,
  findMatchingEpisodesInFeed
}
