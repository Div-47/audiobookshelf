const parseEpubMetadata = require('./parseEpubMetadata')
const parseComicMetadata = require('./parseComicMetadata')

interface EbookFile {
  ebookFormat: string
  metadata: { path: string }
}
interface ParsedBookMetadata extends Record<string, unknown> {
  title?: string | null
  authors?: string[]
  narrators?: string[]
  tags?: string[]
  genres?: string[]
  series?: Array<{ name: string; sequence: string | null }>
}
interface EBookFileScanData {
  path: string
  ebookFormat: string
  ebookCoverPath?: string | null
  metadata: ParsedBookMetadata | null
}
interface EpubParser {
  parse(file: EbookFile): Promise<EBookFileScanData | null>
  extractCoverImage(epubPath: string, coverPath: string, outputPath: string): Promise<boolean>
}
interface ComicParser {
  parse(file: EbookFile): Promise<EBookFileScanData | null>
  extractCoverImage(comicPath: string, coverPath: string, outputPath: string): Promise<boolean>
}

const epubParser = parseEpubMetadata as EpubParser
const comicParser = parseComicMetadata as ComicParser

/**
 * @typedef EBookFileScanData
 * @property {string} path
 * @property {string} ebookFormat
 * @property {string} ebookCoverPath internal image path
 * @property {import('../../scanner/BookScanner').BookMetadataObject} metadata
 */

/**
 * Parse metadata from ebook file
 * 
 * @param {import('../../models/Book').EBookFileObject} ebookFile 
 * @returns {Promise<EBookFileScanData>}
 */
async function parse(ebookFile: EbookFile | null | undefined): Promise<EBookFileScanData | null> {
  if (!ebookFile) return null

  if (ebookFile.ebookFormat === 'epub') {
    return epubParser.parse(ebookFile)
  } else if (['cbz', 'cbr'].includes(ebookFile.ebookFormat)) {
    return comicParser.parse(ebookFile)
  }
  return null
}

/**
 * Extract cover from ebook file
 * 
 * @param {EBookFileScanData} ebookFileScanData 
 * @param {string} outputCoverPath 
 * @returns {Promise<boolean>}
 */
async function extractCoverImage(ebookFileScanData: EBookFileScanData | null | undefined, outputCoverPath: string): Promise<boolean> {
  if (!ebookFileScanData?.ebookCoverPath) return false

  if (ebookFileScanData.ebookFormat === 'epub') {
    return epubParser.extractCoverImage(ebookFileScanData.path, ebookFileScanData.ebookCoverPath, outputCoverPath)
  } else if (['cbz', 'cbr'].includes(ebookFileScanData.ebookFormat)) {
    return comicParser.extractCoverImage(ebookFileScanData.path, ebookFileScanData.ebookCoverPath, outputCoverPath)
  }
  return false
}
const parseEbookMetadata = { parse, extractCoverImage }

export = parseEbookMetadata
