const axios = require('axios').default
const Logger = require('../Logger')
const { isValidASIN } = require('../utils/index')

export interface AudibleRegionMap {
  us: string
  ca: string
  uk: string
  au: string
  fr: string
  de: string
  jp: string
  it: string
  in: string
  es: string
  [key: string]: string
}

export interface AudibleSeriesInfo {
  name: string
  position?: string
}

export interface AudibleGenre {
  type: 'genre' | 'tag'
  name: string
}

export interface AudibleRawItem {
  title: string
  subtitle?: string
  asin: string
  authors?: Array<{ name: string }>
  narrators?: Array<{ name: string }>
  publisherName?: string
  summary?: string
  releaseDate?: string
  image?: string
  genres?: AudibleGenre[]
  seriesPrimary?: AudibleSeriesInfo
  seriesSecondary?: AudibleSeriesInfo
  language?: string
  runtimeLengthMin?: number
  formatType?: string
  isbn?: string
  region?: string
  rating?: string
  isAdult?: boolean
}

export interface AudibleBookResult {
  title: string
  subtitle: string | null
  author: string | null
  narrator: string | null
  publisher: string | undefined
  publishedYear: string | null
  description: string | null
  cover: string | undefined
  asin: string
  isbn: string | undefined
  genres: string[] | null
  tags: string[] | null
  series: Array<{ series: string; sequence: string }> | null
  language: string | null
  duration: number
  region: string | null
  rating: string | null
  abridged: boolean
  explicit: boolean
}

class Audible {
  #responseTimeout = 10000
  regionMap: AudibleRegionMap

  constructor() {
    this.regionMap = {
      us: '.com',
      ca: '.ca',
      uk: '.co.uk',
      au: '.com.au',
      fr: '.fr',
      de: '.de',
      jp: '.co.jp',
      it: '.it',
      in: '.in',
      es: '.es'
    }
  }

  /**
   * Audible will sometimes send sequences with "Book 1" or "2, Dramatized Adaptation"
   * @see https://github.com/advplyr/audiobookshelf/issues/2380
   * @see https://github.com/advplyr/audiobookshelf/issues/1339
   *
   * @param {string} seriesName
   * @param {string} sequence
   * @returns {string}
   */
  cleanSeriesSequence(seriesName: string, sequence: string): string {
    if (!sequence) return ''
    // match any number with optional decimal (e.g, 1 or 1.5 or .5)
    let numberFound = sequence.match(/\.\d+|\d+(?:\.\d+)?/)
    let updatedSequence = numberFound ? numberFound[0] : sequence
    if (sequence !== updatedSequence) {
      Logger.debug(`[Audible] Series "${seriesName}" sequence was cleaned from "${sequence}" to "${updatedSequence}"`)
    }
    return updatedSequence
  }

  cleanResult(item: AudibleRawItem): AudibleBookResult {
    const { title, subtitle, asin, authors, narrators, publisherName, summary, releaseDate, image, genres, seriesPrimary, seriesSecondary, language, runtimeLengthMin, formatType, isbn } = item

    const series: Array<{ series: string; sequence: string }> = []
    if (seriesPrimary) {
      series.push({
        series: seriesPrimary.name,
        sequence: this.cleanSeriesSequence(seriesPrimary.name, seriesPrimary.position || '')
      })
    }
    if (seriesSecondary) {
      series.push({
        series: seriesSecondary.name,
        sequence: this.cleanSeriesSequence(seriesSecondary.name, seriesSecondary.position || '')
      })
    }

    let genresCleaned: string[] = []
    let tagsCleaned: string[] = []

    if (genres && Array.isArray(genres)) {
      genresCleaned = [...new Set(genres.filter((g) => g.type == 'genre').map((g) => g.name))]
      tagsCleaned = [...new Set(genres.filter((g) => g.type == 'tag').map((g) => g.name))]
    }

    return {
      title,
      subtitle: subtitle || null,
      author: authors ? authors.map(({ name }) => name).join(', ') : null,
      narrator: narrators ? narrators.map(({ name }) => name).join(', ') : null,
      publisher: publisherName,
      publishedYear: releaseDate ? releaseDate.split('-')[0] : null,
      description: summary || null,
      cover: image,
      asin,
      isbn,
      genres: genresCleaned.length ? genresCleaned : null,
      tags: tagsCleaned.length ? tagsCleaned : null,
      series: series.length ? series : null,
      language: language ? language.charAt(0).toUpperCase() + language.slice(1) : null,
      duration: runtimeLengthMin && !isNaN(runtimeLengthMin) ? Number(runtimeLengthMin) : 0,
      region: item.region || null,
      rating: item.rating || null,
      abridged: formatType === 'abridged',
      explicit: !!item.isAdult
    }
  }

  /**
   *
   * @param {string} asin
   * @param {string} region
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<AudibleRawItem | null>}
   */
  asinSearch(asin: string, region: string, timeout: number = this.#responseTimeout): Promise<AudibleRawItem | null> {
    if (!asin) return Promise.resolve(null)
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    asin = encodeURIComponent(asin.toUpperCase())
    var regionQuery = region ? `?region=${region}` : ''
    var url = `https://api.audnex.us/books/${asin}${regionQuery}`
    Logger.debug(`[Audible] ASIN url: ${url}`)
    return axios
      .get(url, { timeout })
      .then((res: { data?: AudibleRawItem }) => {
        if (!res?.data?.asin) return null
        return res.data
      })
      .catch((error: Error) => {
        Logger.error('[Audible] ASIN search error', error.message)
        return null
      })
  }

  /**
   *
   * @param {string} title
   * @param {string} author
   * @param {string} asin
   * @param {string} region
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<AudibleBookResult[]>}
   */
  async search(title: string, author: string, asin: string, region: string, timeout: number = this.#responseTimeout): Promise<AudibleBookResult[]> {
    if (region && !this.regionMap[region]) {
      Logger.error(`[Audible] search: Invalid region ${region}`)
      region = ''
    }
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    let items: AudibleRawItem[] = []
    if (asin && isValidASIN(asin.toUpperCase())) {
      const item = await this.asinSearch(asin, region, timeout)
      if (item) items.push(item)
    }

    if (!items.length && isValidASIN(title.toUpperCase())) {
      const item = await this.asinSearch(title, region, timeout)
      if (item) items.push(item)
    }

    if (!items.length) {
      const queryObj: Record<string, string> = {
        num_results: '10',
        products_sort_by: 'Relevance',
        title: title
      }
      if (author) queryObj.author = author
      const queryString = new URLSearchParams(queryObj).toString()
      const tld = region ? this.regionMap[region] : '.com'
      const url = `https://api.audible${tld}/1.0/catalog/products?${queryString}`
      Logger.debug(`[Audible] Search url: ${url}`)
      items = await axios
        .get(url, { timeout })
        .then((res: { data?: { products: Array<{ asin: string }> } }) => {
          if (!res?.data?.products) return null
          return Promise.all(res.data.products.map((result) => this.asinSearch(result.asin, region, timeout)))
        })
        .catch((error: Error) => {
          Logger.error('[Audible] query search error', error.message)
          return []
        })
    }
    return (items || []).filter(Boolean).map((item) => this.cleanResult(item))
  }
}

module.exports = Audible
