const axios = require('axios')
const Logger = require('../Logger')
const htmlSanitizer = require('../utils/htmlSanitizer')

/**
 * @typedef iTunesSearchParams
 */
export interface iTunesSearchParams {
  term: string
  country?: string
  media?: string
  entity?: string
  lang?: string
  limit?: number
}

export interface iTunesPodcastSearchResult {
  id: number
  artistId: number | null
  title: string
  artistName: string
  description: string
  descriptionPlain: string
  releaseDate: string
  genres: string[]
  cover: string | null
  trackCount?: number
  feedUrl: string
  pageUrl: string
  explicit: boolean
}

export interface iTunesAudiobookResult {
  id: number
  artistId: number
  title: string
  author: string
  description: string | null
  publishedYear: string | null
  genres: string[] | null
  cover: string | null
}

class iTunes {
  #responseTimeout = 10000

  constructor() {}

  /**
   * @see https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html
   *
   * @param {iTunesSearchParams} options
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<unknown[]>}
   */
  search(options: iTunesSearchParams, timeout: number = this.#responseTimeout): Promise<unknown[]> {
    if (!options.term) {
      Logger.error('[iTunes] Invalid search options - no term')
      return Promise.resolve([])
    }
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const query = {
      term: options.term,
      media: options.media,
      entity: options.entity,
      lang: options.lang,
      limit: options.limit,
      country: options.country
    }
    return axios
      .get('https://itunes.apple.com/search', { params: query, timeout })
      .then((response: { data: { results?: unknown[] } }) => {
        return response.data.results || []
      })
      .catch((error: Error) => {
        Logger.error(`[iTunes] search request error`, error.message)
        return []
      })
  }

  // Example cover art: https://is1-ssl.mzstatic.com/image/thumb/Music118/v4/cb/ea/73/cbea739b-ff3b-11c4-fb93-7889fbec7390/9781598874983_cover.jpg/100x100bb.jpg
  // 100x100bb can be replaced by other values https://github.com/bendodson/itunes-artwork-finder
  // Target size 600 or larger
  getCoverArtwork(data: Record<string, unknown>): string | null {
    if (data.artworkUrl600) {
      return data.artworkUrl600 as string
    }
    // Should already be sorted from small to large
    var artworkSizes = Object.keys(data)
      .filter((key) => key.startsWith('artworkUrl'))
      .map((key) => {
        return {
          url: data[key] as string,
          size: Number(key.replace('artworkUrl', ''))
        }
      })
    if (!artworkSizes.length) return null

    // Return next biggest size > 600
    var nextBestSize = artworkSizes.find((size) => size.size > 600)
    if (nextBestSize) return nextBestSize.url

    // Find square artwork
    var squareArtwork = artworkSizes.find((size) => (size.url as string).includes(`${size.size}x${size.size}bb`))

    // Square cover replace with 600x600bb
    if (squareArtwork) {
      return (squareArtwork.url as string).replace(`${squareArtwork.size}x${squareArtwork.size}bb`, '600x600bb')
    }

    // Last resort just return biggest size
    return artworkSizes[artworkSizes.length - 1].url as string
  }

  cleanAudiobook(data: Record<string, unknown>): iTunesAudiobookResult {
    // artistName can be "Name1, Name2 & Name3" so we refactor this to "Name1, Name2, Name3"
    //  see: https://github.com/advplyr/audiobookshelf/issues/1022
    const author = ((data.artistName as string) || '').split(' & ').join(', ')

    return {
      id: data.collectionId as number,
      artistId: data.artistId as number,
      title: data.collectionName as string,
      author,
      description: (data.description as string) || null,
      publishedYear: data.releaseDate ? (data.releaseDate as string).split('-')[0] : null,
      genres: data.primaryGenreName ? [data.primaryGenreName as string] : null,
      cover: this.getCoverArtwork(data)
    }
  }

  /**
   *
   * @param {string} term
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<iTunesAudiobookResult[]>}
   */
  searchAudiobooks(term: string, timeout: number = this.#responseTimeout): Promise<iTunesAudiobookResult[]> {
    return this.search({ term, entity: 'audiobook', media: 'audiobook' }, timeout).then((results) => {
      return results.map((r: any) => this.cleanAudiobook(r))
    })
  }

  /**
   *
   * @param {Record<string, unknown>} data
   * @returns {iTunesPodcastSearchResult}
   */
  cleanPodcast(data: Record<string, unknown>): iTunesPodcastSearchResult {
    return {
      id: data.collectionId as number,
      artistId: (data.artistId as number) || null,
      title: data.collectionName as string,
      artistName: data.artistName as string,
      description: htmlSanitizer.sanitize((data.description as string) || ''),
      descriptionPlain: htmlSanitizer.stripAllTags((data.description as string) || ''),
      releaseDate: data.releaseDate as string,
      genres: (data.genres as string[]) || [],
      cover: this.getCoverArtwork(data),
      trackCount: data.trackCount as number,
      feedUrl: data.feedUrl as string,
      pageUrl: data.collectionViewUrl as string,
      explicit: data.trackExplicitness === 'explicit'
    }
  }

  /**
   *
   * @param {string} term
   * @param {{country?: string}} options
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<iTunesPodcastSearchResult[]>}
   */
  searchPodcasts(term: string, options: { country?: string } = {}, timeout: number = this.#responseTimeout): Promise<iTunesPodcastSearchResult[]> {
    return this.search({ term, entity: 'podcast', media: 'podcast', ...options }, timeout).then((results) => {
      return results.map((r: any) => this.cleanPodcast(r))
    })
  }
}
module.exports = iTunes
