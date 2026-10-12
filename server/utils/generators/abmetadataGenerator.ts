const Logger = require('../../Logger')
const parseSeriesString = require('../parsers/parseSeriesString')

type MediaType = 'book' | 'podcast'
type ExpectedMetadataType = 'string' | 'boolean' | 'stringArray'
type MetadataValue = string | number | boolean | null | string[] | ChapterInput[] | undefined
interface ChapterInput { start: number | string | null; end: number | string | null; title: unknown }
interface MetadataChapter { id: number; start: number | string; end: number | string; title: string }
type MetadataResult = Record<string, unknown> & { series?: string[]; title?: string; chapters?: MetadataChapter[] }

const mediaTypeKeys: Record<MediaType, Record<string, ExpectedMetadataType>> = {
  book: {
    tags: 'stringArray',
    title: 'string',
    subtitle: 'string',
    authors: 'stringArray',
    narrators: 'stringArray',
    series: 'stringArray',
    genres: 'stringArray',
    publishedYear: 'string',
    publishedDate: 'string',
    publisher: 'string',
    description: 'string',
    isbn: 'string',
    asin: 'string',
    language: 'string',
    explicit: 'boolean',
    abridged: 'boolean'
  },
  podcast: {
    tags: 'stringArray',
    title: 'string',
    author: 'string',
    description: 'string',
    releaseDate: 'string',
    genres: 'stringArray',
    feedURL: 'string',
    imageURL: 'string',
    itunesPageURL: 'string',
    itunesId: 'string',
    itunesArtistId: 'string',
    asin: 'string',
    language: 'string',
    explicit: 'boolean',
    podcastType: 'string'
  }
}

/**
 *
 * @param {string} text
 * @param {"book" | "podcast"} mediaType
 * @returns {Object}
 */
function parseJsonMetadataText(text: string, mediaType: MediaType): MetadataResult | null {
  try {
    const abmetadataData = JSON.parse(text) as Record<string, unknown>
    const legacyMetadata = abmetadataData.metadata as Record<string, unknown> | undefined

    // Old metadata.json used nested "metadata"
    if (legacyMetadata) {
      for (const key in legacyMetadata) {
        if (legacyMetadata[key] === undefined) continue
        let newModelKey = key
        if (key === 'feedUrl') newModelKey = 'feedURL'
        else if (key === 'imageUrl') newModelKey = 'imageURL'
        else if (key === 'itunesPageUrl') newModelKey = 'itunesPageURL'
        else if (key === 'type') newModelKey = 'podcastType'
        abmetadataData[newModelKey] = legacyMetadata[key]
      }
    }
    delete abmetadataData.metadata

    const expectedKeys = mediaTypeKeys[mediaType]
    if (!expectedKeys) {
      Logger.error(`[abmetadataGenerator] Invalid media type "${mediaType}"`)
      return null
    }

    const validated: MetadataResult = {}
    for (const key in expectedKeys) {
      const expectedType = expectedKeys[key]
      if (!(key in abmetadataData)) continue

      const validatedValue = validateMetadataValue(key, abmetadataData[key], expectedType)
      if (validatedValue !== undefined) {
        validated[key] = validatedValue
      }
    }

    if (validated.series?.length) {
      validated.series = validated.series.map((series) => parseSeriesString.parse(series)).filter((series: string | null): series is string => Boolean(series))
    }

    if (mediaType === 'book' && 'chapters' in abmetadataData) {
      if (abmetadataData.chapters === null) {
        validated.chapters = []
      } else if (Array.isArray(abmetadataData.chapters)) {
        const cleanedChapters = cleanChaptersArray(abmetadataData.chapters as ChapterInput[], String(validated.title ?? abmetadataData.title ?? ''))
        if (cleanedChapters) {
          validated.chapters = cleanedChapters
        }
      } else {
        Logger.warn(`[abmetadataGenerator] Invalid metadata key "chapters" expected array, got ${typeof abmetadataData.chapters}`)
      }
    }

    return validated
  } catch (error) {
    Logger.error(`[abmetadataGenerator] Invalid metadata.json JSON`, error)
    return null
  }
}
module.exports.parseJson = parseJsonMetadataText

/**
 * @param {string} key
 * @param {*} value
 * @param {string} expectedType
 * @returns {*|undefined} undefined excludes the key
 */
function validateMetadataValue(key: string, value: unknown, expectedType: ExpectedMetadataType): MetadataValue {
  if (expectedType === 'string') {
    if (value === null) return null
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') return value
    Logger.warn(`[abmetadataGenerator] Invalid metadata key "${key}" expected string, got ${typeof value}`)
    return undefined
  }

  if (expectedType === 'boolean') {
    if (value === null) return null
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const lower = value.toLowerCase()
      if (lower === 'true') return true
      if (lower === 'false') return false
    }
    Logger.warn(`[abmetadataGenerator] Invalid metadata key "${key}" expected boolean, got ${typeof value}`)
    return undefined
  }

  // Filter empty strings and deduplicate
  if (expectedType === 'stringArray') {
    if (value === null) return []
    if (!Array.isArray(value)) {
      Logger.warn(`[abmetadataGenerator] Invalid metadata key "${key}" expected string array, got ${typeof value}`)
      return undefined
    }

    const cleanedArray = value.filter((t): t is string => typeof t === 'string')
    return [...new Set(cleanedArray.map((t) => t.trim()).filter((t) => t))]
  }

  Logger.warn(`[abmetadataGenerator] Unknown expected type "${expectedType}" for key "${key}"`)
  return undefined
}

/**
 * @param {Object[]} chaptersArray
 * @param {string} mediaTitle
 * @returns {Object[]}
 */
function cleanChaptersArray(chaptersArray: ChapterInput[], mediaTitle: string): MetadataChapter[] | null {
  const chapters: MetadataChapter[] = []
  let index = 0
  for (const chap of chaptersArray) {
    if (chap.start === null || isNaN(Number(chap.start))) {
      Logger.error(`[abmetadataGenerator] Invalid chapter start time ${chap.start} for "${mediaTitle}" metadata file`)
      return null
    }
    if (chap.end === null || isNaN(Number(chap.end))) {
      Logger.error(`[abmetadataGenerator] Invalid chapter end time ${chap.end} for "${mediaTitle}" metadata file`)
      return null
    }
    if (!chap.title || typeof chap.title !== 'string') {
      Logger.error(`[abmetadataGenerator] Invalid chapter title ${chap.title} for "${mediaTitle}" metadata file`)
      return null
    }

    chapters.push({
      id: index++,
      start: chap.start as number | string,
      end: chap.end as number | string,
      title: chap.title
    })
  }
  return chapters
}

export {}
