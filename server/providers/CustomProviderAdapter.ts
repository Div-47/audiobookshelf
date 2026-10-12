const axios = require('axios').default
const Database = require('../Database')
const Logger = require('../Logger')
const htmlSanitizer = require('../utils/htmlSanitizer')

export interface CustomProviderSeries {
  series: string
  sequence?: string
}

export interface CustomProviderBookResult {
  title?: string
  subtitle?: string
  author?: string
  narrator?: string
  publisher?: string
  publishedYear?: string
  description?: string
  cover?: string
  isbn?: string
  asin?: string
  genres?: string[]
  tags?: string[]
  series?: CustomProviderSeries[]
  language?: string
  duration?: number
  [key: string]: unknown
}

class CustomProviderAdapter {
  #responseTimeout = 10000

  constructor() {}

  /**
   *
   * @param {string} title
   * @param {string} author
   * @param {string} isbn
   * @param {string} providerSlug
   * @param {string} mediaType
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<CustomProviderBookResult[]>}
   */
  async search(title: string, author: string, isbn: string, providerSlug: string, mediaType: string, timeout: number = this.#responseTimeout): Promise<CustomProviderBookResult[]> {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const providerId = providerSlug.split('custom-')[1]
    const provider = await Database.customMetadataProviderModel.findByPk(providerId)

    if (!provider) {
      throw new Error('Custom provider not found for the given id')
    }

    // Setup query params
    const queryObj: Record<string, string> = {
      mediaType,
      query: title
    }
    if (author) {
      queryObj.author = author
    }
    if (isbn) {
      queryObj.isbn = isbn
    }
    const queryString = new URLSearchParams(queryObj).toString()

    const url = `${provider.url}/search?${queryString}`
    Logger.debug(`[CustomMetadataProvider] Search url: ${url}`)

    // Setup headers
    const axiosOptions: Record<string, unknown> = {
      timeout
    }
    if (provider.authHeaderValue) {
      axiosOptions.headers = {
        Authorization: provider.authHeaderValue
      }
    }

    const matches: Record<string, any>[] = await axios
      .get(url, axiosOptions)
      .then((res: { data?: { matches?: Record<string, any>[] } }) => {
        if (!res?.data || !Array.isArray(res.data.matches)) return null
        return res.data.matches
      })
      .catch((error: Error) => {
        Logger.error('[CustomMetadataProvider] Search error', error.message)
        return []
      })

    if (!matches) {
      throw new Error('Custom provider returned malformed response')
    }

    const toStringOrUndefined = (value: unknown): string | undefined => {
      if (typeof value === 'string' || typeof value === 'number') return String(value)
      if (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')) return value.join(',')
      return undefined
    }
    const validateSeriesArray = (series: unknown): CustomProviderSeries[] | undefined => {
      if (!Array.isArray(series) || !series.length) return undefined
      return series
        .map((s) => {
          if (!s?.series || typeof s.series !== 'string') return undefined
          const _series: CustomProviderSeries = {
            series: s.series
          }
          if (s.sequence && (typeof s.sequence === 'string' || typeof s.sequence === 'number')) {
            _series.sequence = String(s.sequence)
          }
          return _series
        })
        .filter((s): s is CustomProviderSeries => s !== undefined)
    }
    /**
     * Validates and dedupes tags/genres array
     * Can be comma separated string or array of strings
     * @param {string|string[]} tagsGenres
     * @returns {string[] | undefined}
     */
    const validateTagsGenresArray = (tagsGenres: unknown): string[] | undefined => {
      if (!tagsGenres || (typeof tagsGenres !== 'string' && !Array.isArray(tagsGenres))) return undefined

      let arr: string[]
      // If string, split by comma and trim each item
      if (typeof tagsGenres === 'string') arr = tagsGenres.split(',')
      // If array, ensure all items are strings
      else if (tagsGenres.every((t) => typeof t === 'string')) arr = tagsGenres as string[]
      else return undefined

      // Trim and filter out empty strings
      arr = arr.map((t) => t.trim()).filter(Boolean)
      if (!arr.length) return undefined

      // Dedup
      return [...new Set(arr)]
    }

    // re-map keys to throw out
    return matches.map((match) => {
      const { title, subtitle, author, narrator, publisher, publishedYear, description, cover, isbn, asin, genres, tags, series, language, duration } = match

      const payload: Record<string, any> = {
        title: toStringOrUndefined(title),
        subtitle: toStringOrUndefined(subtitle),
        author: toStringOrUndefined(author),
        narrator: toStringOrUndefined(narrator),
        publisher: toStringOrUndefined(publisher),
        publishedYear: toStringOrUndefined(publishedYear),
        description: description && typeof description === 'string' ? htmlSanitizer.sanitize(description) : undefined,
        cover: toStringOrUndefined(cover),
        isbn: toStringOrUndefined(isbn),
        asin: toStringOrUndefined(asin),
        genres: validateTagsGenresArray(genres),
        tags: validateTagsGenresArray(tags),
        series: validateSeriesArray(series),
        language: toStringOrUndefined(language),
        duration: !isNaN(duration) && duration !== null ? Number(duration) : undefined
      }

      // Remove undefined values
      for (const key in payload) {
        if (payload[key] === undefined) {
          delete payload[key]
        }
      }

      return payload as CustomProviderBookResult
    })
  }
}

module.exports = CustomProviderAdapter
