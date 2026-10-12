const opfParser = require('../utils/parsers/parseOpfMetadata') as {
  parseOpfMetadataXML(xml: string): Promise<ParsedOpfMetadata | null>
}
const { readTextFile } = require('../utils/fileUtils')

interface MetadataFile { metadata: { path: string } }
interface BookMetadataTarget extends Record<string, unknown> {
  tags: string[]
  genres: string[]
  authors: string[]
  narrators: string[]
  series: Array<{ name: string; sequence: string | null }>
}
interface ParsedOpfMetadata extends Record<string, unknown> {
  tags?: string[]
  genres?: string[]
  authors?: string[]
  narrators?: string[]
  series?: Array<{ name: string; sequence: string | null }>
}

class OpfFileScanner {
  constructor() {}

  /**
   * Parse metadata from .opf file found in library scan and update bookMetadata
   *
   * @param {import('../models/LibraryItem').LibraryFileObject} opfLibraryFileObj
   * @param {Object} bookMetadata
   */
  async scanBookOpfFile(opfLibraryFileObj: MetadataFile, bookMetadata: BookMetadataTarget): Promise<void> {
    const xmlText = await readTextFile(opfLibraryFileObj.metadata.path)
    const opfMetadata = xmlText ? await opfParser.parseOpfMetadataXML(xmlText) : null
    if (opfMetadata) {
      for (const key in opfMetadata) {
        if (key === 'tags') {
          // Add tags only if tags are empty
          if (opfMetadata.tags?.length) {
            bookMetadata.tags = opfMetadata.tags
          }
        } else if (key === 'genres') {
          // Add genres only if genres are empty
          if (opfMetadata.genres?.length) {
            bookMetadata.genres = opfMetadata.genres
          }
        } else if (key === 'authors') {
          if (opfMetadata.authors?.length) {
            bookMetadata.authors = opfMetadata.authors
          }
        } else if (key === 'narrators') {
          if (opfMetadata.narrators?.length) {
            bookMetadata.narrators = opfMetadata.narrators
          }
        } else if (key === 'series') {
          if (opfMetadata.series?.length) {
            bookMetadata.series = opfMetadata.series
          }
        } else if (opfMetadata[key] && key !== 'sequence') {
          bookMetadata[key] = opfMetadata[key]
        }
      }
    }
  }
}
export = new OpfFileScanner()
