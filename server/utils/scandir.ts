const Path = require('path')
const { filePathToPOSIX } = require('./fileUtils')
const globals = require('./globals')
const LibraryFile = require('../objects/files/LibraryFile')
const parseNameString = require('./parsers/parseNameString')

import type { FilePathItem } from './fileUtils'

interface LibraryItemFilenameMetadata {
  title: string
  subtitle: string | null
  asin: string | null
  authors: string[]
  narrators: string[]
  seriesName: string | null
  seriesSequence: string | null
  publishedYear: string | null
}

interface PodcastFilenameMetadata {
  title: string
}

interface MediaFilenameMetadata {
  title: string
  subtitle?: string | null
  asin?: string | null
  authors?: string[]
  narrators?: string[]
  seriesName?: string | null
  seriesSequence?: string | null
  publishedYear?: string | null
}
type LibraryItemGroups = Record<string, string | string[]>

function isMediaFile(mediaType: string, ext: string, audiobooksOnly = false): boolean {
  if (!ext) return false
  const extclean = ext.slice(1).toLowerCase()
  if (mediaType === 'podcast') return globals.SupportedAudioTypes.includes(extclean)
  else if (audiobooksOnly) return globals.SupportedAudioTypes.includes(extclean)
  return globals.SupportedAudioTypes.includes(extclean) || globals.SupportedEbookTypes.includes(extclean)
}

function isScannableNonMediaFile(ext: string): boolean {
  if (!ext) return false
  const extclean = ext.slice(1).toLowerCase()
  return globals.TextFileTypes.includes(extclean) || globals.MetadataFileTypes.includes(extclean) || globals.SupportedImageTypes.includes(extclean)
}

function checkFilepathIsAudioFile(filepath: string): boolean {
  const ext = Path.extname(filepath)
  if (!ext) return false
  const extclean = ext.slice(1).toLowerCase()
  return globals.SupportedAudioTypes.includes(extclean)
}

/**
 * @param {string} mediaType
 * @param {import('./fileUtils').FilePathItem[]} fileItems
 * @param {boolean} audiobooksOnly
 * @param {boolean} [includeNonMediaFiles=false] - Used by the watcher to re-scan when covers/metadata files are added/removed
 * @returns {Record<string,string[]>} map of files grouped into potential libarary item dirs
 */
function groupFileItemsIntoLibraryItemDirs(mediaType: string, fileItems: FilePathItem[], audiobooksOnly: boolean, includeNonMediaFiles = false): LibraryItemGroups {
  // Step 1: Filter out non-book-media files in root dir (with depth of 0)
  const itemsFiltered = fileItems.filter((i) => {
    return i.deep > 0 || (mediaType === 'book' && isMediaFile(mediaType, i.extension, audiobooksOnly))
  })

  // Step 2: Separate media files and other files
  //     - Directories without a media file will not be included (unless includeNonMediaFiles is true)
  const mediaFileItems: FilePathItem[] = []
  const otherFileItems: FilePathItem[] = []
  itemsFiltered.forEach((item) => {
    if (isMediaFile(mediaType, item.extension, audiobooksOnly) || (includeNonMediaFiles && isScannableNonMediaFile(item.extension))) {
      mediaFileItems.push(item)
    } else {
      otherFileItems.push(item)
    }
  })

  // Step 3: Group media files (or non-media files if includeNonMediaFiles is true) in library items
  const libraryItemGroup: LibraryItemGroups = {}
  mediaFileItems.forEach((item) => {
    const dirparts = item.reldirpath.split('/').filter((p) => !!p)
    const numparts = dirparts.length
    let _path = ''

    if (!dirparts.length) {
      // Media file in root
      libraryItemGroup[item.name] = item.name
    } else {
      // Iterate over directories in path
      for (let i = 0; i < numparts; i++) {
        const dirpart = dirparts.shift() || ''
        _path = Path.posix.join(_path, dirpart)

        if (libraryItemGroup[_path]) {
          // Directory already has files, add file
          const relpath = Path.posix.join(dirparts.join('/'), item.name)
          ;(libraryItemGroup[_path] as string[]).push(relpath)
          return
        } else if (!dirparts.length) {
          // This is the last directory, create group
          libraryItemGroup[_path] = [item.name]
          return
        } else if (dirparts.length === 1 && /^(cd|dis[ck])\s*\d{1,3}$/i.test(dirparts[0])) {
          // Next directory is the last and is a CD dir, create group
          libraryItemGroup[_path] = [Path.posix.join(dirparts[0], item.name)]
          return
        }
      }
    }
  })

  // Step 4: Add other files into library item groups
  otherFileItems.forEach((item) => {
    const dirparts = item.reldirpath.split('/')
    const numparts = dirparts.length
    let _path = ''

    // Iterate over directories in path
    for (let i = 0; i < numparts; i++) {
      const dirpart = dirparts.shift() || ''
      _path = Path.posix.join(_path, dirpart)
      if (libraryItemGroup[_path]) {
        // Directory is audiobook group
        const relpath = Path.posix.join(dirparts.join('/'), item.name)
        ;(libraryItemGroup[_path] as string[]).push(relpath)
        return
      }
    }
  })
  return libraryItemGroup
}

/**
 * Get LibraryFile from filepath
 * @param {string} libraryItemPath
 * @param {string[]} files
 * @returns {import('../objects/files/LibraryFile')}
 */
function buildLibraryFile(libraryItemPath: string, files: string[]) {
  return Promise.all(
    files.map(async (file) => {
      const filePath = Path.posix.join(libraryItemPath, file)
      const newLibraryFile = new LibraryFile()
      await newLibraryFile.setDataFromPath(filePath, file)
      return newLibraryFile
    })
  )
}

/**
 * Get details parsed from filenames
 *
 * @param {string} relPath
 * @param {boolean} parseSubtitle
 * @returns {LibraryItemFilenameMetadata}
 */
function getBookDataFromDir(relPath: string, parseSubtitle = false): LibraryItemFilenameMetadata {
  const splitDir = relPath.split('/')

  const titleFolder = splitDir.pop() || '' // Audio files will always be in the directory named for the title
  const series = splitDir.length > 1 ? splitDir.pop() || null : null // If there are at least 2 more directories, next furthest will be the series
  const author = splitDir.length > 0 ? splitDir.pop() || null : null // There could be many more directories, but only the top 3 are used for naming /author/series/title/

  // Each extractor strips one piece of metadata and returns the remaining folder name.
  const [afterAsin, asin] = getASIN(titleFolder)
  const [afterNarrators, narrators] = getNarrator(afterAsin)
  const [afterSequence, sequence] = series ? getSequence(afterNarrators) : [afterNarrators, null]
  const [afterYear, publishedYear] = getPublishedYear(afterSequence)
  const [title, subtitle] = parseSubtitle ? getSubtitle(afterYear) : [afterYear, null]

  return {
    title,
    subtitle,
    asin,
    authors: parseNameString.parse(author)?.names || [],
    narrators: parseNameString.parse(narrators)?.names || [],
    seriesName: series,
    seriesSequence: sequence,
    publishedYear
  }
}
module.exports.getBookDataFromDir = getBookDataFromDir

/**
 * Extract narrator from folder name
 *
 * @param {string} folder
 * @returns {[string, string]} [folder, narrator]
 */
function getNarrator(folder: string): [string, string | null] {
  const pattern = /^(?<title>.*) \{(?<narrators>.*)\}$/
  const match = folder.match(pattern)
  return match?.groups ? [match.groups.title || '', match.groups.narrators || ''] : [folder, null]
}

/**
 * Extract series sequence from folder name
 *
 * @example
 * 'Book 2 - Title - Subtitle'
 * 'Title - Subtitle - Vol 12'
 * 'Title - volume 9 - Subtitle'
 * 'Vol. 3 Title Here - Subtitle'
 * '1980 - Book 2 - Title'
 * 'Volume 12. Title - Subtitle'
 * '100 - Book Title'
 * '6. Title'
 * '0.5 - Book Title'
 *
 * @param {string} folder
 * @returns {[string, string]} [folder, sequence]
 */
function getSequence(folder: string): [string, string | null] {
  // Matches a valid volume string. Also matches a book whose title starts with a 1 to 3 digit number. Will handle that later.
  const pattern = /^(?<volumeLabel>vol\.? |volume |book )?(?<sequence>\d{0,3}(?:\.\d{1,2})?)(?<trailingDot>\.?)(?: (?<suffix>.*))?$/i

  let volumeNumber: string | null = null
  const parts = folder.split(' - ')
  for (let i = 0; i < parts.length; i++) {
    const match = parts[i].match(pattern)
    // This excludes '101 Dalmations' but includes '101. Dalmations'
    if (match?.groups && !(match.groups.suffix && !(match.groups.volumeLabel || match.groups.trailingDot))) {
      volumeNumber = isNaN(Number(match.groups.sequence)) ? match.groups.sequence : Number(match.groups.sequence).toString()
      parts[i] = match.groups.suffix || ''
      if (!parts[i]) {
        parts.splice(i, 1)
      }
      break
    }
  }

  folder = parts.join(' - ')
  return [folder, volumeNumber]
}

/**
 * Extract published year from folder name
 *
 * @param {string} folder
 * @returns {[string, string]} [folder, publishedYear]
 */
function getPublishedYear(folder: string): [string, string | null] {
  let publishedYear: string | null = null

  const pattern = /^ *\(?([0-9]{4})\)? * - *(.+)/ //Matches #### - title or (####) - title
  const match = folder.match(pattern)
  if (match) {
    publishedYear = match[1]
    folder = match[2]
  }

  return [folder, publishedYear]
}

/**
 * Extract subtitle from folder name
 *
 * @param {string} folder
 * @returns {[string, string]} [folder, subtitle]
 */
function getSubtitle(folder: string): [string, string] {
  // Subtitle is everything after " - "
  const splitTitle = folder.split(' - ')
  return [splitTitle.shift() || '', splitTitle.join(' - ')]
}

/**
 * Extract asin from folder name
 *
 * @param {string} folder
 * @returns {[string, string]} [folder, asin]
 */
function getASIN(folder: string): [string, string | null] {
  let asin: string | null = null

  const pattern = /(?: |^)\[([A-Z0-9]{10})](?= |$)/ // Matches "[B0015T963C]"
  const match = folder.match(pattern)
  if (match) {
    asin = match[1]
    folder = folder.replace(match[0], '')
  }
  return [folder.trim(), asin]
}

/**
 *
 * @param {string} relPath
 * @returns {LibraryItemFilenameMetadata}
 */
function getPodcastDataFromDir(relPath: string): PodcastFilenameMetadata {
  const splitDir = relPath.split('/')

  // Audio files will always be in the directory named for the title
  const title = splitDir.pop() || ''
  return {
    title
  }
}

/**
 *
 * @param {string} libraryMediaType
 * @param {string} folderPath
 * @param {string} relPath
 * @returns {{ mediaMetadata: LibraryItemFilenameMetadata, relPath: string, path: string}}
 */
function getDataFromMediaDir(libraryMediaType: string, folderPath: string, relPath: string): { mediaMetadata: MediaFilenameMetadata; relPath: string; path: string } {
  relPath = filePathToPOSIX(relPath)
  let fullPath = Path.posix.join(folderPath, relPath)
  let mediaMetadata: MediaFilenameMetadata

  if (libraryMediaType === 'podcast') {
    mediaMetadata = getPodcastDataFromDir(relPath)
  } else {
    // book
    mediaMetadata = getBookDataFromDir(relPath, !!(global as typeof globalThis & { ServerSettings?: { scannerParseSubtitle?: boolean } }).ServerSettings?.scannerParseSubtitle)
  }

  return {
    mediaMetadata,
    relPath,
    path: fullPath
  }
}

const scandir = {
  checkFilepathIsAudioFile,
  groupFileItemsIntoLibraryItemDirs,
  buildLibraryFile,
  getBookDataFromDir,
  getDataFromMediaDir
}

export = scandir
