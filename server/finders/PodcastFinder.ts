const Logger = require('../Logger')
const iTunes = require('../providers/iTunes')

interface PodcastSearchResult { cover?: string | null; [key: string]: unknown }
interface PodcastSearchOptions { country?: string }
interface ITunesClient {
  searchPodcasts(term: string, options?: PodcastSearchOptions): Promise<PodcastSearchResult[]>
}
const ITunesProvider = iTunes as new () => ITunesClient

class PodcastFinder {
  private iTunesApi: ITunesClient
  constructor() { this.iTunesApi = new ITunesProvider() }

  /**
   *
   * @param {string} term
   * @param {{country:string}} options
   * @returns {Promise<import('../providers/iTunes').iTunesPodcastSearchResult[]>}
   */
  async search(term: string | null | undefined, options: PodcastSearchOptions = {}): Promise<PodcastSearchResult[] | null> {
    if (!term) return null
    Logger.debug(`[iTunes] Searching for podcast with term "${term}"`)
    const results = await this.iTunesApi.searchPodcasts(term, options)
    Logger.debug(`[iTunes] Podcast search for "${term}" returned ${results.length} results`)
    return results
  }

  /**
   * @param {string} term
   * @returns {Promise<string[]>}
   */
  async findCovers(term: string | null | undefined): Promise<string[] | null> {
    if (!term) return null
    Logger.debug(`[iTunes] Searching for podcast covers with term "${term}"`)
    const results = await this.iTunesApi.searchPodcasts(term)
    if (!results) return []
    return results.map((result) => result.cover).filter((cover): cover is string => !!cover)
  }
}
export = new PodcastFinder()
