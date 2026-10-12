const axios = require('axios')
const Logger = require('../Logger')

export interface GoogleBooksVolumeInfo {
  title?: string
  subtitle?: string
  authors?: string[]
  publisher?: string
  publisherDate?: string
  description?: string
  industryIdentifiers?: Array<{ type: string; identifier: string }>
  categories?: string[]
  imageLinks?: Record<string, string>
}

export interface GoogleBooksVolume {
  id: string
  volumeInfo?: GoogleBooksVolumeInfo
}

export interface GoogleBookResult {
  id: string
  title: string | undefined
  subtitle: string | null
  author: string | null
  publisher: string | undefined
  publishedYear: string | null
  description: string | undefined
  cover: string | null
  genres: string[] | null
  isbn: string | null
}

class GoogleBooks {
  #responseTimeout = 10000

  constructor() {}

  extractIsbn(industryIdentifiers: Array<{ type: string; identifier: string }> | undefined): string | null {
    if (!industryIdentifiers || !industryIdentifiers.length) return null

    var isbnObj = industryIdentifiers.find((i) => i.type === 'ISBN_13') || industryIdentifiers.find((i) => i.type === 'ISBN_10')
    if (isbnObj && isbnObj.identifier) return isbnObj.identifier
    return null
  }

  cleanResult(item: GoogleBooksVolume): GoogleBookResult | null {
    var { id, volumeInfo } = item
    if (!volumeInfo) return null
    const { title, subtitle, authors, publisher, publisherDate, description, industryIdentifiers, categories, imageLinks } = volumeInfo

    let cover: string | null = null
    // Selects the largest cover assuming the largest is the last key in the object
    if (imageLinks && Object.keys(imageLinks).length) {
      cover = imageLinks[Object.keys(imageLinks).pop()!]
      cover = cover?.replace(/^http:/, 'https:') || null
    }

    return {
      id,
      title,
      subtitle: subtitle || null,
      author: authors ? authors.join(', ') : null,
      publisher,
      publishedYear: publisherDate ? publisherDate.split('-')[0] : null,
      description,
      cover,
      genres: categories && Array.isArray(categories) ? [...categories] : null,
      isbn: this.extractIsbn(industryIdentifiers)
    }
  }

  /**
   * Search for a book by title and author
   * @param {string} title
   * @param {string} author
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<(GoogleBookResult | null)[]>}
   **/
  async search(title: string, author: string, timeout: number = this.#responseTimeout): Promise<(GoogleBookResult | null)[]> {
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    title = encodeURIComponent(title)
    let queryString = `q=intitle:${title}`
    if (author) {
      author = encodeURIComponent(author)
      queryString += `+inauthor:${author}`
    }
    const url = `https://www.googleapis.com/books/v1/volumes?${queryString}`
    Logger.debug(`[GoogleBooks] Search url: ${url}`)
    const items: GoogleBooksVolume[] = await axios
      .get(url, { timeout })
      .then((res: { data?: { items?: GoogleBooksVolume[] } }) => {
        if (!res || !res.data || !res.data.items) return []
        return res.data.items
      })
      .catch((error: Error) => {
        Logger.error('[GoogleBooks] Volume search error', error.message)
        return []
      })
    return items.map((item) => this.cleanResult(item))
  }
}

module.exports = GoogleBooks
