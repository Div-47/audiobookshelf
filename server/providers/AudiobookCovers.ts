const axios = require('axios')
const Logger = require('../Logger')

export interface AudiobookCoversResult {
  cover: string
}

class AudiobookCovers {
  #responseTimeout = 10000

  constructor() {}

  /**
   *
   * @param {string} search
   * @param {number} [timeout]
   * @returns {Promise<AudiobookCoversResult[]>}
   */
  async search(search: string, timeout: number = this.#responseTimeout): Promise<AudiobookCoversResult[]> {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const url = `https://api.audiobookcovers.com/cover/bytext/`
    const params = new URLSearchParams([['q', search]])
    const items = await axios
      .get(url, {
        params,
        timeout
      })
      .then((res: { data?: Array<{ versions: { png: { original: string } } }> }) => res?.data || [])
      .catch((error: Error) => {
        Logger.error('[AudiobookCovers] Cover search error', error.message)
        return []
      })
    return items.map((item: { versions: { png: { original: string } } }) => ({ cover: item.versions.png.original }))
  }
}

module.exports = AudiobookCovers
