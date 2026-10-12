const Path = require('path')
const fsExtra = require('../libs/fsExtra')
const { readTextFile } = require('../utils/fileUtils')
const { LogLevel } = require('../utils/constants')
const abmetadataGenerator = require('../utils/generators/abmetadataGenerator')

type MetadataMediaType = 'book' | 'podcast'
interface MetadataChapter {
  id: number
  start: number
  end: number
  title: string
}
interface MetadataSeries {
  name: string
  sequence: string | null
}
type ParsedMetadataValue = string | boolean | string[] | MetadataSeries[] | MetadataChapter[] | null
interface ParsedMetadata {
  [key: string]: ParsedMetadataValue | undefined
  tags?: string[]
  authors?: string[]
  genres?: string[]
  chapters?: MetadataChapter[]
}
interface MetadataParser {
  parseJson(text: string, mediaType: MetadataMediaType): ParsedMetadata | null
}
interface MetadataFile {
  metadata: { path: string }
}
interface MetadataScanData {
  metadataJsonLibraryFile?: MetadataFile | null
}
interface MetadataLog {
  addLog(level: number, message: string): void
}
type MetadataTarget = Record<string, unknown>
type MetadataGlobals = typeof globalThis & { MetadataPath: string }

const metadataParser = abmetadataGenerator as MetadataParser

class AbsMetadataFileScanner {
  constructor() {}

  /**
   * Check for metadata.json file and set book metadata
   *
   * @param {import('./LibraryScan')} libraryScan
   * @param {import('./LibraryItemScanData')} libraryItemData
   * @param {Object} bookMetadata
   * @param {string} [existingLibraryItemId]
   */
  async scanBookMetadataFile(libraryScan: MetadataLog, libraryItemData: MetadataScanData, bookMetadata: MetadataTarget, existingLibraryItemId: string | null = null): Promise<void> {
    const metadataLibraryFile = libraryItemData.metadataJsonLibraryFile
    let metadataText = metadataLibraryFile ? await readTextFile(metadataLibraryFile.metadata.path) : null
    let metadataFilePath = metadataLibraryFile?.metadata.path

    // When metadata file is not stored with library item then check in the /metadata/items folder for it
    if (!metadataText && existingLibraryItemId) {
      let metadataPath = Path.join((global as MetadataGlobals).MetadataPath, 'items', existingLibraryItemId)

      metadataFilePath = Path.join(metadataPath, 'metadata.json')
      if (await fsExtra.pathExists(metadataFilePath)) {
        metadataText = await readTextFile(metadataFilePath)
      }
    }

    if (metadataText) {
      libraryScan.addLog(LogLevel.INFO, `Found metadata file "${metadataFilePath}"`)
      const abMetadata = metadataParser.parseJson(metadataText, 'book') || {}

      for (const key in abMetadata) {
        // TODO: When to override with null or empty arrays?
        if (abMetadata[key] === undefined || abMetadata[key] === null) continue
        if (key === 'authors' && !abMetadata.authors?.length) continue
        if (key === 'genres' && !abMetadata.genres?.length) continue
        if (key === 'tags' && !abMetadata.tags?.length) continue
        if (key === 'chapters' && !abMetadata.chapters?.length) continue

        bookMetadata[key] = abMetadata[key]
      }
    }
  }

  /**
   * Check for metadata.json file and set podcast metadata
   *
   * @param {import('./LibraryScan')} libraryScan
   * @param {import('./LibraryItemScanData')} libraryItemData
   * @param {Object} podcastMetadata
   * @param {string} [existingLibraryItemId]
   */
  async scanPodcastMetadataFile(libraryScan: MetadataLog, libraryItemData: MetadataScanData, podcastMetadata: MetadataTarget, existingLibraryItemId: string | null = null): Promise<void> {
    const metadataLibraryFile = libraryItemData.metadataJsonLibraryFile
    let metadataText = metadataLibraryFile ? await readTextFile(metadataLibraryFile.metadata.path) : null
    let metadataFilePath = metadataLibraryFile?.metadata.path

    // When metadata file is not stored with library item then check in the /metadata/items folder for it
    if (!metadataText && existingLibraryItemId) {
      let metadataPath = Path.join((global as MetadataGlobals).MetadataPath, 'items', existingLibraryItemId)

      metadataFilePath = Path.join(metadataPath, 'metadata.json')
      if (await fsExtra.pathExists(metadataFilePath)) {
        metadataText = await readTextFile(metadataFilePath)
      }
    }

    if (metadataText) {
      libraryScan.addLog(LogLevel.INFO, `Found metadata file "${metadataFilePath}"`)
      const abMetadata = metadataParser.parseJson(metadataText, 'podcast') || {}
      for (const key in abMetadata) {
        if (abMetadata[key] === undefined || abMetadata[key] === null) continue
        if (key === 'tags' && !abMetadata.tags?.length) continue

        podcastMetadata[key] = abMetadata[key]
      }
    }
  }
}
export = new AbsMetadataFileScanner()
