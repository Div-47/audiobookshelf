export interface BookSearchResult {
  id?: string | number
  title?: string
  subtitle?: string | null
  author?: string | null
  narrator?: string | null
  publisher?: string | null
  publishedYear?: string | null
  description?: string | null
  cover?: string | null
  covers?: string[]
  isbn?: string | null
  asin?: string | null
  genres?: string[] | null
  tags?: string[] | null
  series?: Array<{ series: string; sequence?: string }> | null
  language?: string | null
  duration?: number
  matchConfidence?: number | null
  [key: string]: unknown
}

export interface BookSearchParams {
  title?: string
  author?: string
  isbn?: string
  asin?: string
  provider?: string
  limit?: number
}

export interface PodcastSearchResult {
  id?: string | number
  title?: string
  artistName?: string
  description?: string
  descriptionPlain?: string
  cover?: string | null
  feedUrl?: string
  pageUrl?: string
  genres?: string[]
  episodes?: unknown[]
  trackCount?: number
  releaseDate?: string
  explicit?: boolean
  [key: string]: unknown
}
