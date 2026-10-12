const OpenLibrary = require('../providers/OpenLibrary')
const GoogleBooks = require('../providers/GoogleBooks')
const Audible = require('../providers/Audible')
const iTunes = require('../providers/iTunes')
const Audnexus = require('../providers/Audnexus')
const FantLab = require('../providers/FantLab')
const AudiobookCovers = require('../providers/AudiobookCovers')
const CustomProviderAdapter = require('../providers/CustomProviderAdapter')
const Logger = require('../Logger')
const { levenshteinDistance, levenshteinSimilarity, escapeRegExp, isValidASIN } = require('../utils/index')
const htmlSanitizer = require('../utils/htmlSanitizer')

export interface BookSearchOptions {
  titleDistance?: number
  authorDistance?: number
  maxFuzzySearches?: number
  [key: string]: unknown
}

class BookFinder {
  #providerResponseTimeout = 10000
  openLibrary: any
  googleBooks: any
  audible: any
  iTunesApi: any
  audnexus: any
  fantLab: any
  audiobookCovers: any
  customProviderAdapter: any
  providers: string[]
  verbose: boolean

  constructor() {
    this.openLibrary = new OpenLibrary()
    this.googleBooks = new GoogleBooks()
    this.audible = new Audible()
    this.iTunesApi = new iTunes()
    this.audnexus = new Audnexus()
    this.fantLab = new FantLab()
    this.audiobookCovers = new AudiobookCovers()
    this.customProviderAdapter = new CustomProviderAdapter()

    this.providers = ['google', 'itunes', 'openlibrary', 'fantlab', 'audiobookcovers', 'audible', 'audible.ca', 'audible.uk', 'audible.au', 'audible.fr', 'audible.de', 'audible.jp', 'audible.it', 'audible.in', 'audible.es']

    this.verbose = false
  }

  async findByISBN(isbn: string): Promise<any> {
    var book = await this.openLibrary.isbnLookup(isbn)
    if (book.errorCode) {
      Logger.error('Book not found')
    }
    return book
  }

  filterSearchResults(books: any[], title: string, author: string, maxTitleDistance: number, maxAuthorDistance: number): any[] {
    var searchTitle = cleanTitleForCompares(title)
    var searchAuthor = cleanAuthorForCompares(author)
    return books
      .map((b) => {
        b.cleanedTitle = cleanTitleForCompares(b.title)
        b.titleDistance = levenshteinDistance(b.cleanedTitle, title)

        // Total length of search (title or both title & author)
        b.totalPossibleDistance = b.title.length

        if (author) {
          if (!b.author) {
            b.authorDistance = author.length
          } else {
            b.totalPossibleDistance += b.author.length
            b.cleanedAuthor = cleanAuthorForCompares(b.author)

            var cleanedAuthorDistance = levenshteinDistance(b.cleanedAuthor, searchAuthor)
            var authorDistance = levenshteinDistance(b.author || '', author)

            // Use best distance
            b.authorDistance = Math.min(cleanedAuthorDistance, authorDistance)

            // Check book author contains searchAuthor
            if (searchAuthor.length > 4 && b.cleanedAuthor.includes(searchAuthor)) b.includesAuthor = searchAuthor
            else if (author.length > 4 && b.author.includes(author)) b.includesAuthor = author
          }
        }
        b.totalDistance = b.titleDistance + (b.authorDistance || 0)

        // Check book title contains the searchTitle
        if (searchTitle.length > 4 && b.cleanedTitle.includes(searchTitle)) b.includesTitle = searchTitle
        else if (title.length > 4 && b.title.includes(title)) b.includesTitle = title

        return b
      })
      .filter((b) => {
        if (b.includesTitle) {
          // If search title was found in result title then skip over leven distance check
          if (this.verbose) Logger.debug(`Exact title was included in "${b.title}", Search: "${b.includesTitle}"`)
        } else if (b.titleDistance > maxTitleDistance) {
          if (this.verbose) Logger.debug(`Filtering out search result title distance = ${b.titleDistance}: "${b.cleanedTitle}"/"${searchTitle}"`)
          return false
        }

        if (author) {
          if (b.includesAuthor) {
            // If search author was found in result author then skip over leven distance check
            if (this.verbose) Logger.debug(`Exact author was included in "${b.author}", Search: "${b.includesAuthor}"`)
          } else if (b.authorDistance > maxAuthorDistance) {
            if (this.verbose) Logger.debug(`Filtering out search result "${b.author}", author distance = ${b.authorDistance}: "${b.author}"/"${author}"`)
            return false
          }
        }

        // If book total search length < 5 and was not exact match, then filter out
        if (b.totalPossibleDistance < 5 && b.totalDistance > 0) return false
        return true
      })
  }

  /**
   *
   * @param {string} title
   * @param {string} author
   * @param {number} maxTitleDistance
   * @param {number} maxAuthorDistance
   * @returns {Promise<any[]>}
   */
  async getOpenLibResults(title: string, author: string, maxTitleDistance: number, maxAuthorDistance: number): Promise<any[]> {
    var books = await this.openLibrary.searchTitle(title, this.#providerResponseTimeout)
    if (this.verbose) Logger.debug(`OpenLib Book Search Results: ${books.length || 0}`)
    if (books.errorCode) {
      Logger.error(`OpenLib Search Error ${books.errorCode}`)
      return []
    }
    var booksFiltered = this.filterSearchResults(books, title, author, maxTitleDistance, maxAuthorDistance)
    if (!booksFiltered.length && books.length) {
      if (this.verbose) Logger.debug(`Search has ${books.length} matches, but no close title matches`)
    }
    booksFiltered.sort((a, b) => {
      return a.totalDistance - b.totalDistance
    })

    return booksFiltered
  }

  /**
   *
   * @param {string} title
   * @param {string} author
   * @returns {Promise<any[]>}
   */
  async getGoogleBooksResults(title: string, author: string): Promise<any[]> {
    var books = await this.googleBooks.search(title, author, this.#providerResponseTimeout)
    if (this.verbose) Logger.debug(`GoogleBooks Book Search Results: ${books.length || 0}`)
    if (books.errorCode) {
      Logger.error(`GoogleBooks Search Error ${books.errorCode}`)
      return []
    }
    // Google has good sort
    return books
  }

  /**
   *
   * @param {string} title
   * @param {string} author
   * @returns {Promise<any[]>}
   */
  async getFantLabResults(title: string, author: string): Promise<any[]> {
    var books = await this.fantLab.search(title, author, this.#providerResponseTimeout)
    if (this.verbose) Logger.debug(`FantLab Book Search Results: ${books.length || 0}`)
    if (books.errorCode) {
      Logger.error(`FantLab Search Error ${books.errorCode}`)
      return []
    }

    return books
  }

  /**
   *
   * @param {string} search
   * @returns {Promise<any[]>}
   */
  async getAudiobookCoversResults(search: string): Promise<any[]> {
    const covers = await this.audiobookCovers.search(search, this.#providerResponseTimeout)
    if (this.verbose) Logger.debug(`AudiobookCovers Search Results: ${covers.length || 0}`)
    return covers || []
  }

  /**
   *
   * @param {string} title
   * @returns {Promise<any[]>}
   */
  async getiTunesAudiobooksResults(title: string): Promise<any[]> {
    return this.iTunesApi.searchAudiobooks(title, this.#providerResponseTimeout)
  }

  /**
   *
   * @param {string} title
   * @param {string} author
   * @param {string} asin
   * @param {string} provider
   * @returns {Promise<any[]>}
   */
  async getAudibleResults(title: string, author: string, asin: string, provider: string): Promise<any[]> {
    const region = provider.includes('.') ? provider.split('.').pop() : ''
    const books = await this.audible.search(title, author, asin, region, this.#providerResponseTimeout)
    if (this.verbose) Logger.debug(`Audible Book Search Results: ${books.length || 0}`)
    if (!books) return []
    return books
  }

  /**
   *
   * @param {string} title
   * @param {string} author
   * @param {string} isbn
   * @param {string} providerSlug
   * @returns {Promise<any[]>}
   */
  async getCustomProviderResults(title: string, author: string, isbn: string, providerSlug: string): Promise<any[]> {
    try {
      const books = await this.customProviderAdapter.search(title, author, isbn, providerSlug, 'book', this.#providerResponseTimeout)
      if (this.verbose) Logger.debug(`Custom provider '${providerSlug}' Search Results: ${books.length || 0}`)
      return books
    } catch (error) {
      Logger.error(`Error searching Custom provider '${providerSlug}':`, error)
      return []
    }
  }

  static TitleCandidates = class {
    candidates: Set<string>
    cleanAuthor: string
    priorities: Record<string, number>
    positions: Record<string, number>
    currentPosition: number

    constructor(cleanAuthor: string) {
      this.candidates = new Set()
      this.cleanAuthor = cleanAuthor
      this.priorities = {}
      this.positions = {}
      this.currentPosition = 0
    }

    add(title: string) {
      // if title contains the author, remove it
      title = this.#removeAuthorFromTitle(title)

      const titleTransformers: Array<[RegExp, string]> = [
        [/(: |[,;_]| by ).*/g, ''], // Remove subtitle
        [/(^| )\d+k(bps)?( |$)/, ' '], // Remove bitrate
        [/ (2nd|3rd|\d+th)\s+ed(\.|ition)?/g, ''], // Remove edition
        [/(^| |\.)(m4b|m4a|mp3)( |$)/g, ''], // Remove file-type
        [/ a novel.*$/g, ''], // Remove "a novel"
        [/(^| )(un)?abridged( |$)/g, ' '], // Remove "unabridged/abridged"
        [/^\d+ | \d+$/g, ''] // Remove preceding/trailing numbers
      ]

      // Main variant
      const cleanTitle = cleanTitleForCompares(title).trim()
      if (!cleanTitle) return
      this.candidates.add(cleanTitle)
      this.priorities[cleanTitle] = 0
      this.positions[cleanTitle] = this.currentPosition

      let candidate = cleanTitle

      for (const transformer of titleTransformers) candidate = candidate.replace(transformer[0], transformer[1]).trim()

      if (candidate != cleanTitle) {
        if (candidate) {
          this.candidates.add(candidate)
          this.priorities[candidate] = 0
          this.positions[candidate] = this.currentPosition
        }
        this.priorities[cleanTitle] = 1
      }
      this.currentPosition++
    }

    get size(): number {
      return this.candidates.size
    }

    getCandidates(): string[] {
      var candidates = [...this.candidates]
      candidates.sort((a, b) => {
        // Candidates that include only digits are also likely low quality
        const onlyDigits = /^\d+$/
        const includesOnlyDigitsDiff = Number(onlyDigits.test(a)) - Number(onlyDigits.test(b))
        if (includesOnlyDigitsDiff) return includesOnlyDigitsDiff
        // transformed candidates receive higher priority
        const priorityDiff = this.priorities[a] - this.priorities[b]
        if (priorityDiff) return priorityDiff
        // if same priorirty, prefer candidates that are closer to the beginning (e.g. titles before subtitles)
        const positionDiff = this.positions[a] - this.positions[b]
        return positionDiff // candidates with same priority always have different positions
      })
      Logger.debug(`[${this.constructor.name}] Found ${candidates.length} fuzzy title candidates`)
      Logger.debug(candidates)
      return candidates
    }

    delete(title: string): boolean {
      return this.candidates.delete(title)
    }

    #removeAuthorFromTitle(title: string): string {
      if (!this.cleanAuthor) return title
      const authorRe = new RegExp(`(^| | by |)${escapeRegExp(this.cleanAuthor)}(?= |$)`, 'g')
      const authorCleanedTitle = cleanAuthorForCompares(title)
      const authorCleanedTitleWithoutAuthor = authorCleanedTitle.replace(authorRe, '')
      if (authorCleanedTitleWithoutAuthor !== authorCleanedTitle) {
        return authorCleanedTitleWithoutAuthor.trim()
      }
      return title
    }
  }

  static AuthorCandidates = class {
    audnexus: any
    candidates: Set<string>
    cleanAuthor: string

    constructor(cleanAuthor: string, audnexus: any) {
      this.audnexus = audnexus
      this.candidates = new Set()
      this.cleanAuthor = cleanAuthor
      if (cleanAuthor) this.candidates.add(cleanAuthor)
    }

    validateAuthor(name: string, region = '', maxLevenshtein = 2): Promise<string> {
      return this.audnexus.authorASINsRequest(name, region).then((asins: Array<{ name: string }>) => {
        for (const [i, asin] of asins.entries()) {
          if (i > 10) break
          let cleanName = cleanAuthorForCompares(asin.name)
          if (!cleanName) continue
          if (cleanName.includes(name)) return name
          if (name.includes(cleanName)) return cleanName
          if (levenshteinDistance(cleanName, name) <= maxLevenshtein) return cleanName
        }
        return ''
      })
    }

    add(author: string) {
      const cleanAuthor = cleanAuthorForCompares(author).trim()
      if (!cleanAuthor) return
      this.candidates.add(cleanAuthor)
    }

    get size(): number {
      return this.candidates.size
    }

    get agressivelyCleanAuthor(): string {
      if (this.cleanAuthor) {
        const agressivelyCleanAuthor = this.cleanAuthor.replace(/[,/-].*$/, '').trim()
        return agressivelyCleanAuthor ? agressivelyCleanAuthor : this.cleanAuthor
      }
      return ''
    }

    async getCandidates(): Promise<string[]> {
      var filteredCandidates: string[] = []
      var promises: Promise<string>[] = []
      for (const candidate of this.candidates) {
        promises.push(this.validateAuthor(candidate))
      }
      const results = [...new Set(await Promise.all(promises))]
      filteredCandidates = results.filter((author) => author)
      // If no valid candidates were found, add back an aggresively cleaned author version
      if (!filteredCandidates.length && this.cleanAuthor) filteredCandidates.push(this.agressivelyCleanAuthor)
      // Always add an empty author candidate
      filteredCandidates.push('')
      Logger.debug(`[${this.constructor.name}] Found ${filteredCandidates.length} fuzzy author candidates`)
      Logger.debug(filteredCandidates)
      return filteredCandidates
    }

    delete(author: string): boolean {
      return this.candidates.delete(author)
    }
  }

  /**
   * Search for books including fuzzy searches
   *
   * @param {any} libraryItem
   * @param {string} provider
   * @param {string} title
   * @param {string} author
   * @param {string} isbn
   * @param {string} asin
   * @param {BookSearchOptions} options
   * @returns {Promise<any[]>}
   */
  async search(libraryItem: any, provider: string, title: string, author: string, isbn?: string, asin?: string, options: BookSearchOptions = {}): Promise<any[]> {
    let books: any[] = []
    const maxTitleDistance = !isNaN(options.titleDistance as number) ? Number(options.titleDistance) : 4
    const maxAuthorDistance = !isNaN(options.authorDistance as number) ? Number(options.authorDistance) : 4
    const maxFuzzySearches = !isNaN(options.maxFuzzySearches as number) ? Number(options.maxFuzzySearches) : 5
    let numFuzzySearches = 0

    // Custom providers are assumed to be correct
    if (provider.startsWith('custom-')) {
      return this.getCustomProviderResults(title, author, isbn || '', provider)
    }

    if (!title) return books

    // Truncate excessively long inputs to prevent ReDoS attacks
    const MAX_INPUT_LENGTH = 500
    title = title.substring(0, MAX_INPUT_LENGTH)
    author = author?.substring(0, MAX_INPUT_LENGTH) || author

    const isTitleAsin = isValidASIN(title.toUpperCase())

    let actualTitleQuery = title
    let actualAuthorQuery = author
    books = await this.runSearch(actualTitleQuery, actualAuthorQuery, provider, asin || '', maxTitleDistance, maxAuthorDistance)

    if (!books.length && maxFuzzySearches > 0) {
      // Normalize title and author
      title = title.trim().toLowerCase()
      author = author?.trim().toLowerCase() || ''

      const cleanAuthor = cleanAuthorForCompares(author)

      // Now run up to maxFuzzySearches fuzzy searches
      let authorCandidatesInstance = new BookFinder.AuthorCandidates(cleanAuthor, this.audnexus)

      // Remove underscores and parentheses with their contents, and replace with a separator
      // Use negated character classes to prevent ReDoS vulnerability (input length validated at entry point)
      const cleanTitle = title.replace(/\[[^\]]*\]|\([^)]*\)|{[^}]*}|_/g, ' - ')
      // Split title into hypen-separated parts
      const titleParts = cleanTitle.split(/ - | -|- /)
      for (const titlePart of titleParts) authorCandidatesInstance.add(titlePart)
      const authorCandidates = await authorCandidatesInstance.getCandidates()
      loop_author: for (const authorCandidate of authorCandidates) {
        let titleCandidatesInstance = new BookFinder.TitleCandidates(authorCandidate)
        for (const titlePart of titleParts) titleCandidatesInstance.add(titlePart)
        const titleCandidates = titleCandidatesInstance.getCandidates()
        for (const titleCandidate of titleCandidates) {
          if (titleCandidate == actualTitleQuery && authorCandidate == actualAuthorQuery) continue // We already tried this
          if (++numFuzzySearches > maxFuzzySearches) break loop_author
          actualTitleQuery = titleCandidate
          actualAuthorQuery = authorCandidate
          books = await this.runSearch(actualTitleQuery, actualAuthorQuery, provider, asin || '', maxTitleDistance, maxAuthorDistance)
          if (books.length) break loop_author
        }
      }
    }

    if (books.length && libraryItem) {
      const isAudibleProvider = provider.startsWith('audible')
      const libraryItemDurationMinutes = libraryItem?.media?.duration ? libraryItem.media.duration / 60 : null

      books.forEach((book) => {
        if (typeof book !== 'object' || !isAudibleProvider) return
        book.matchConfidence = this.calculateMatchConfidence(book, libraryItemDurationMinutes, actualTitleQuery, actualAuthorQuery, isTitleAsin)
      })

      if (isAudibleProvider && libraryItemDurationMinutes) {
        books.sort((a, b) => {
          const aDuration = a.duration || Number.POSITIVE_INFINITY
          const bDuration = b.duration || Number.POSITIVE_INFINITY
          const aDurationDiff = Math.abs(aDuration - libraryItemDurationMinutes)
          const bDurationDiff = Math.abs(bDuration - libraryItemDurationMinutes)
          return aDurationDiff - bDurationDiff
        })
      }
    }
    return books
  }

  /**
   * Calculate match confidence score for a book
   * @param {any} book - The book object to calculate confidence for
   * @param {number|null} libraryItemDurationMinutes - Duration of library item in minutes
   * @param {string} actualTitleQuery - Actual title query
   * @param {string} actualAuthorQuery - Actual author query
   * @param {boolean} isTitleAsin - Whether the title is an ASIN
   * @returns {number|null} - Match confidence score or null if not applicable
   */
  calculateMatchConfidence(book: any, libraryItemDurationMinutes: number | null, actualTitleQuery: string, actualAuthorQuery: string, isTitleAsin: boolean): number | null {
    // ASIN results are always a match
    if (isTitleAsin) return 1.0

    let durationScore: number
    if (libraryItemDurationMinutes && typeof book.duration === 'number') {
      const durationDiff = Math.abs(book.duration - libraryItemDurationMinutes)
      if (durationDiff <= 1) {
        durationScore = 1.0
      } else if (durationDiff <= 5) {
        durationScore = 1.1 - 0.1 * durationDiff
      } else if (durationDiff <= 10) {
        durationScore = 1.2 - 0.12 * durationDiff
      } else {
        durationScore = 0.0
      }
      Logger.debug(`[BookFinder] Duration diff: ${durationDiff}, durationScore: ${durationScore}`)
    } else {
      // Default score if library item duration or book duration is not available
      durationScore = 0.1
    }

    const calculateTitleScore = (titleQuery: string, bookItem: any, keepSubtitle = false) => {
      const cleanTitle = cleanTitleForCompares(bookItem.title || '', keepSubtitle)
      const cleanSubtitle = keepSubtitle && bookItem.subtitle ? `: ${bookItem.subtitle}` : ''
      const normBookTitle = `${cleanTitle}${cleanSubtitle}`
      const normTitleQuery = cleanTitleForCompares(titleQuery, keepSubtitle)
      const titleSimilarity = levenshteinSimilarity(normTitleQuery, normBookTitle)
      Logger.debug(`[BookFinder] keepSubtitle: ${keepSubtitle}, normBookTitle: ${normBookTitle}, normTitleQuery: ${normTitleQuery}, titleSimilarity: ${titleSimilarity}`)
      return titleSimilarity
    }
    const titleQueryHasSubtitle = hasSubtitle(actualTitleQuery)
    const titleScore = calculateTitleScore(actualTitleQuery, book, titleQueryHasSubtitle)

    let authorScore: number
    const normAuthorQuery = cleanAuthorForCompares(actualAuthorQuery)
    const normBookAuthor = cleanAuthorForCompares(book.author || '')
    if (!normAuthorQuery) {
      // Original query had no author
      authorScore = 1.0 // Neutral score
    } else {
      // Original query HAS an author
      if (normBookAuthor) {
        const bookAuthorParts = normBookAuthor.split(',').map((name) => name.trim().toLowerCase())
        const validBookAuthorParts = bookAuthorParts.filter((p) => p.length > 0)

        if (validBookAuthorParts.length === 0) {
          authorScore = 0.0
        } else {
          let maxPartScore = levenshteinSimilarity(normAuthorQuery, normBookAuthor)
          Logger.debug(`[BookFinder] normAuthorQuery: ${normAuthorQuery}, normBookAuthor: ${normBookAuthor}, similarity: ${maxPartScore}`)
          if (validBookAuthorParts.length > 1 || normBookAuthor.includes(',')) {
            validBookAuthorParts.forEach((part) => {
              const similarity = levenshteinSimilarity(normAuthorQuery, part)
              Logger.debug(`[BookFinder] normAuthorQuery: ${normAuthorQuery}, bookAuthorPart: ${part}, similarity: ${similarity}`)
              const currentPartScore = similarity
              maxPartScore = Math.max(maxPartScore, currentPartScore)
            })
          }
          authorScore = maxPartScore
        }
      } else {
        authorScore = 0.0
      }
    }

    const W_DURATION = 0.7
    const W_TITLE = 0.2
    const W_AUTHOR = 0.1

    Logger.debug(`[BookFinder] Duration score: ${durationScore}, Title score: ${titleScore}, Author score: ${authorScore}`)
    const confidence = W_DURATION * durationScore + W_TITLE * titleScore + W_AUTHOR * authorScore
    Logger.debug(`[BookFinder] Confidence: ${confidence}`)
    return Math.max(0, Math.min(1, confidence))
  }

  /**
   * Search for books
   *
   * @param {string} title
   * @param {string} author
   * @param {string} provider
   * @param {string} [asin] only used for audible providers
   * @param {number} [maxTitleDistance] only used for openlibrary provider
   * @param {number} [maxAuthorDistance] only used for openlibrary provider
   * @returns {Promise<any[]>}
   */
  async runSearch(title: string, author: string, provider: string, asin?: string, maxTitleDistance = 4, maxAuthorDistance = 4): Promise<any[]> {
    Logger.debug(`Book Search: title: "${title}", author: "${author || ''}", provider: ${provider}`)

    let books: any[] = []

    if (provider === 'google') {
      books = await this.getGoogleBooksResults(title, author)
    } else if (provider.startsWith('audible')) {
      books = await this.getAudibleResults(title, author, asin || '', provider)
    } else if (provider === 'itunes') {
      books = await this.getiTunesAudiobooksResults(title)
    } else if (provider === 'openlibrary') {
      books = await this.getOpenLibResults(title, author, maxTitleDistance, maxAuthorDistance)
    } else if (provider === 'fantlab') {
      books = await this.getFantLabResults(title, author)
    } else if (provider === 'audiobookcovers') {
      books = await this.getAudiobookCoversResults(title)
    } else {
      books = await this.getGoogleBooksResults(title, author)
    }

    books.forEach((book) => {
      if (book.description) {
        book.description = htmlSanitizer.sanitize(book.description)
        book.descriptionPlain = htmlSanitizer.stripAllTags(book.description)
      }
    })
    return books
  }

  async findCovers(provider: string, title: string, author: string, options: BookSearchOptions = {}): Promise<string[]> {
    let searchResults: any[] = []

    if (provider === 'all') {
      for (const providerString of this.providers) {
        const providerResults = await this.search(null, providerString, title, author, undefined, undefined, options)
        Logger.debug(`[BookFinder] Found ${providerResults.length} covers from ${providerString}`)
        searchResults.push(...providerResults)
      }
    } else if (provider === 'best') {
      const bestProviders = ['google', 'fantlab', 'audible']
      for (const providerString of bestProviders) {
        const providerResults = await this.search(null, providerString, title, author, undefined, undefined, options)
        Logger.debug(`[BookFinder] Found ${providerResults.length} covers from ${providerString}`)
        searchResults.push(...providerResults)
      }
    } else {
      searchResults = await this.search(null, provider, title, author, undefined, undefined, options)
    }
    Logger.debug(`[BookFinder] FindCovers search results: ${searchResults.length}`)

    const covers: string[] = []
    searchResults.forEach((result) => {
      if (result.covers && result.covers.length) {
        covers.push(...result.covers)
      }
      if (result.cover) {
        covers.push(result.cover)
      }
    })
    return [...new Set(covers)]
  }

  findChapters(asin: string, region?: string): Promise<any> {
    return this.audnexus.getChaptersByASIN(asin, region)
  }
}

module.exports = new BookFinder()

function hasSubtitle(title: string): boolean {
  return title.includes(': ') || title.includes(' - ')
}
function stripSubtitle(title: string): string {
  if (title.includes(': ')) {
    return title.split(': ')[0].trim()
  } else if (title.includes(' - ')) {
    return title.split(' - ')[0].trim()
  }
  return title
}

function replaceAccentedChars(str: string): string {
  try {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  } catch (error) {
    Logger.error('[BookFinder] str normalize error', error)
    return str
  }
}

function cleanTitleForCompares(title: string, keepSubtitle = false): string {
  if (!title) return ''
  title = stripRedundantSpaces(title)

  let stripped = keepSubtitle ? title : stripSubtitle(title)
  let cleaned = stripped.replace(/\([^)]*\)/g, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  cleaned = cleaned.replace(/'/g, '')
  return replaceAccentedChars(cleaned).toLowerCase()
}

function cleanAuthorForCompares(author: string): string {
  if (!author) return ''
  author = stripRedundantSpaces(author)

  let cleanAuthor = replaceAccentedChars(author).toLowerCase()
  cleanAuthor = cleanAuthor.replace(/([a-z])\.([a-z])/g, '$1. $2')
  cleanAuthor = cleanAuthor.replace(/(?<=\w\w)(\s+[a-z]\.?)+(?=\s+\w\w)/g, '')
  cleanAuthor = cleanAuthor.replace(/ et al\.?(?= |$)/g, '')
  return cleanAuthor
}

function stripRedundantSpaces(str: string): string {
  return str.replace(/\s+/g, ' ').trim()
}
