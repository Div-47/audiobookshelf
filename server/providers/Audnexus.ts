const axios = require('axios').default
const Throttle = require('p-throttle')
const Logger = require('../Logger')
const { levenshteinDistance, isValidASIN } = require('../utils/index')

export interface AuthorSearchObj {
  asin: string
  description?: string
  image: string | null
  name: string
}

export interface AuthorAsinObj {
  asin: string
  name: string
  levenshteinDistance?: number
}

class Audnexus {
  static _instance: Audnexus | null = null
  baseUrl!: string
  limiter!: (fn: () => any) => () => Promise<any>

  constructor() {
    // ensures Audnexus class is singleton
    if (Audnexus._instance) {
      return Audnexus._instance
    }

    this.baseUrl = 'https://api.audnex.us'

    // Rate limit is 100 requests per minute.
    // @see https://github.com/laxamentumtech/audnexus#-deployment-
    this.limiter = Throttle({
      // Setting the limit to 1 allows for a short pause between requests that is imperceptible to the end user.
      // A larger limit will grab blocks faster and then wait for the alloted time(interval) before
      // fetching another batch, but with a discernable pause from the user perspective.
      limit: 1,
      strict: true,
      interval: 150
    })

    Audnexus._instance = this
  }

  /**
   *
   * @param {string} name
   * @param {string} [region]
   * @returns {Promise<AuthorAsinObj[]>}
   */
  authorASINsRequest(name: string, region?: string): Promise<AuthorAsinObj[]> {
    const searchParams = new URLSearchParams()
    searchParams.set('name', name)

    if (region) searchParams.set('region', region)

    const authorRequestUrl = `${this.baseUrl}/authors?${searchParams.toString()}`
    Logger.info(`[Audnexus] Searching for author "${authorRequestUrl}"`)

    return this._processRequest(this.limiter(() => axios.get(authorRequestUrl)))
      .then((res: { data?: AuthorAsinObj[] }) => res.data || [])
      .catch((error: Error) => {
        Logger.error(`[Audnexus] Author ASIN request failed for ${name}`, error.message)
        return []
      })
  }

  /**
   *
   * @param {string} asin
   * @param {string} [region]
   * @returns {Promise<AuthorSearchObj | null>}
   */
  authorRequest(asin: string, region?: string): Promise<AuthorSearchObj | null> {
    if (!isValidASIN(asin?.toUpperCase?.())) {
      Logger.error(`[Audnexus] Invalid ASIN ${asin}`)
      return Promise.resolve(null)
    }

    asin = encodeURIComponent(asin.toUpperCase())

    const authorRequestUrl = new URL(`${this.baseUrl}/authors/${asin}`)
    if (region) authorRequestUrl.searchParams.set('region', region)

    Logger.info(`[Audnexus] Searching for author "${authorRequestUrl}"`)

    return this._processRequest(this.limiter(() => axios.get(authorRequestUrl.toString())))
      .then((res: { data?: AuthorSearchObj }) => res.data || null)
      .catch((error: Error) => {
        Logger.error(`[Audnexus] Author request failed for ${asin}`, error.message)
        return null
      })
  }

  /**
   *
   * @param {string} asin
   * @param {string} [region]
   * @returns {Promise<AuthorSearchObj | null>}
   */
  async findAuthorByASIN(asin: string, region?: string): Promise<AuthorSearchObj | null> {
    const author = await this.authorRequest(asin, region)

    return author
      ? {
          asin: author.asin,
          description: author.description,
          image: author.image || null,
          name: author.name
        }
      : null
  }

  /**
   *
   * @param {string} name
   * @param {string} [region]
   * @param {number} [maxLevenshtein=3]
   * @returns {Promise<AuthorSearchObj | null>}
   */
  async findAuthorByName(name: string, region?: string, maxLevenshtein = 3): Promise<AuthorSearchObj | null> {
    Logger.debug(`[Audnexus] Looking up author by name ${name}`)
    const authorAsinObjs = await this.authorASINsRequest(name, region)

    let closestMatch: AuthorAsinObj | null = null
    for (const authorAsinObj of authorAsinObjs) {
      const dist = levenshteinDistance(authorAsinObj.name, name)
      authorAsinObj.levenshteinDistance = dist
      if (!closestMatch || (closestMatch.levenshteinDistance !== undefined && closestMatch.levenshteinDistance > dist)) {
        closestMatch = authorAsinObj
      }
    }

    if (!closestMatch || (closestMatch.levenshteinDistance !== undefined && closestMatch.levenshteinDistance > maxLevenshtein)) {
      return null
    }

    const author = await this.authorRequest(closestMatch.asin, region)
    if (!author) {
      return null
    }

    return {
      asin: author.asin,
      description: author.description,
      image: author.image || null,
      name: author.name
    }
  }

  /**
   *
   * @param {string} asin
   * @param {string} [region]
   * @returns {Promise<Record<string, unknown> | null>}
   */
  getChaptersByASIN(asin: string, region?: string): Promise<Record<string, unknown> | null> {
    Logger.debug(`[Audnexus] Get chapters for ASIN ${asin}/${region}`)

    asin = encodeURIComponent(asin.toUpperCase())
    const chaptersRequestUrl = new URL(`${this.baseUrl}/books/${asin}/chapters`)
    if (region) chaptersRequestUrl.searchParams.set('region', region)

    return this._processRequest(this.limiter(() => axios.get(chaptersRequestUrl.toString())))
      .then((res: { data?: Record<string, unknown> }) => res.data || null)
      .catch((error: Error) => {
        Logger.error(`[Audnexus] Chapter ASIN request failed for ${asin}/${region}`, error.message)
        return null
      })
  }

  /**
   * Internal method to process requests and retry if rate limit is exceeded.
   */
  async _processRequest(request: () => Promise<any>): Promise<any> {
    try {
      return await request()
    } catch (error: any) {
      if (error.response?.status === 429) {
        const retryAfter = parseInt(error.response.headers?.['retry-after'], 10) || 5

        Logger.warn(`[Audnexus] Rate limit exceeded. Retrying in ${retryAfter} seconds.`)
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))

        return this._processRequest(request)
      }

      throw error
    }
  }
}

module.exports = Audnexus
