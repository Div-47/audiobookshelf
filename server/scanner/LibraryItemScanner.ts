const Path = require('path')
const { LogLevel, ScanResult } = require('../utils/constants')

const fileUtils = require('../utils/fileUtils')
const scanUtils = require('../utils/scandir')
const libraryFilters = require('../utils/queries/libraryFilters')
const Logger = require('../Logger')
const Database = require('../Database')
const Watcher = require('../Watcher')
import LibraryScan = require('./LibraryScan')
import LibraryItemScanData = require('./LibraryItemScanData')
import ScanLogger = require('./ScanLogger')
const LibraryFile = require('../objects/files/LibraryFile')
const SocketAuthority = require('../SocketAuthority')

type MediaType = 'book' | 'podcast'
type LibraryItemScanDataInstance = InstanceType<typeof LibraryItemScanData>
type ScanLifecycle = InstanceType<typeof LibraryScan> | InstanceType<typeof ScanLogger>
type ExistingLibraryItem = Parameters<LibraryItemScanDataInstance['checkLibraryItemData']>[0] & {
  id: string
  libraryId: string
  libraryFolderId: string
  mediaType: MediaType
}

interface LibrarySettings {
  [key: string]: unknown
  audiobooksOnly?: boolean
}

interface LibraryFolderRecord {
  id: string
  libraryId: string
  path: string
}

interface LibraryRecord {
  id: string
  name: string
  mediaType: MediaType
  settings: LibrarySettings
  libraryFolders: LibraryFolderRecord[]
}

interface ScanUpdateDetails {
  relPath?: string
  path?: string
  libraryFolderId?: string
  isFile?: boolean
}

interface ScannedFile {
  fullpath: string
  path: string
}

interface FileStats {
  ino: string
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
}

interface LibraryFileShape {
  [key: string]: unknown
  ino: string | null
  metadata: {
    filename: string | null
    ext: string | null
    path: string | null
    relPath: string | null
    size: number | null
    [key: string]: string | number | boolean | null | undefined
  }
  isSupplementary: boolean | null
  addedAt: number | null
  updatedAt: number | null
  isEBookFile: boolean
  setDataFromPath(path: string, relPath: string): Promise<void>
  toJSON(): LibraryFileShape
}

interface RescanResult {
  libraryItem: ExistingLibraryItem
  wasUpdated: boolean
}

interface BookScannerApi {
  rescanExistingBookLibraryItem(item: ExistingLibraryItem, data: LibraryItemScanDataInstance, settings: LibrarySettings, scan: ScanLifecycle): Promise<RescanResult>
  scanNewBookLibraryItem(data: LibraryItemScanDataInstance, settings: LibrarySettings, scan: ScanLifecycle): Promise<ExistingLibraryItem | null>
  emitAuthorsNumBooksUpdated(libraryId: string, scan: ScanLifecycle): Promise<void>
  checkAuthorsRemovedFromBooks(libraryId: string, scan: ScanLifecycle): Promise<void>
  checkSeriesRemovedFromBooks(libraryId: string, scan: ScanLifecycle): Promise<void>
}

interface PodcastScannerApi {
  rescanExistingPodcastLibraryItem(item: ExistingLibraryItem, data: LibraryItemScanDataInstance, settings: LibrarySettings, scan: ScanLifecycle): Promise<RescanResult>
  scanNewPodcastLibraryItem(data: LibraryItemScanDataInstance, settings: LibrarySettings, scan: ScanLifecycle): Promise<ExistingLibraryItem | null>
}

const BookScanner = require('./BookScanner') as BookScannerApi
const PodcastScanner = require('./PodcastScanner') as PodcastScannerApi

class LibraryItemScanner {
  async scanLibraryItem(libraryItemId: string, updateLibraryItemDetails: ScanUpdateDetails | null = null): Promise<number> {
    // TODO: Add task manager
    const libraryItem = (await Database.libraryItemModel.findByPk(libraryItemId)) as ExistingLibraryItem | null
    if (!libraryItem) {
      Logger.error(`[LibraryItemScanner] Library item not found "${libraryItemId}"`)
      return ScanResult.NOTHING
    }

    const libraryFolderId = updateLibraryItemDetails?.libraryFolderId || libraryItem.libraryFolderId
    const library = (await Database.libraryModel.findByPk(libraryItem.libraryId, {
      include: {
        model: Database.libraryFolderModel,
        where: {
          id: libraryFolderId
        }
      }
    })) as LibraryRecord | null
    if (!library) {
      Logger.error(`[LibraryItemScanner] Library "${libraryItem.libraryId}" not found for library item "${libraryItem.id}"`)
      return ScanResult.NOTHING
    }

    // Make sure library filter data is set
    //   this is used to check for existing authors & series
    await libraryFilters.getFilterData(library.mediaType, library.id)

    const scanLogger = new ScanLogger()
    scanLogger.verbose = true
    scanLogger.setData('libraryItem', updateLibraryItemDetails?.relPath || libraryItem.relPath)

    const libraryItemPath = updateLibraryItemDetails?.path || fileUtils.filePathToPOSIX(libraryItem.path)
    const folder = library.libraryFolders[0]
    const libraryItemScanData = await this.getLibraryItemScanData(libraryItemPath, library, folder, updateLibraryItemDetails?.isFile || false)

    const libraryItemDataUpdated = await libraryItemScanData.checkLibraryItemData(libraryItem, scanLogger)

    const { libraryItem: expandedLibraryItem, wasUpdated } = await this.rescanLibraryItemMedia(libraryItem, libraryItemScanData, library.settings, scanLogger)
    if (libraryItemDataUpdated || wasUpdated) {
      SocketAuthority.libraryItemEmitter('item_updated', expandedLibraryItem)

      await this.finalizeAuthorsAndSeriesFromScan(library.id, scanLogger)

      return ScanResult.UPDATED
    }

    scanLogger.addLog(LogLevel.DEBUG, `Library item is up-to-date`)
    return ScanResult.UPTODATE
  }

  async finalizeAuthorsAndSeriesFromScan(libraryId: string, scanLogger: ScanLogger): Promise<void> {
    await BookScanner.emitAuthorsNumBooksUpdated(libraryId, scanLogger)
    if (scanLogger.authorsRemovedFromBooks.length) {
      await BookScanner.checkAuthorsRemovedFromBooks(libraryId, scanLogger)
    }
    if (scanLogger.seriesRemovedFromBooks.length) {
      await BookScanner.checkSeriesRemovedFromBooks(libraryId, scanLogger)
    }
  }

  async getLibraryItemScanData(libraryItemPath: string, library: LibraryRecord, folder: LibraryFolderRecord, isSingleMediaItem: boolean): Promise<LibraryItemScanDataInstance> {
    const libraryFolderPath: string = fileUtils.filePathToPOSIX(folder.path)
    const libraryItemDir = libraryItemPath.replace(libraryFolderPath, '').slice(1)

    let libraryItemData: {
      path: string
      relPath: string
      mediaMetadata: { title: string } | ReturnType<typeof scanUtils.getDataFromMediaDir>['mediaMetadata']
    }
    let fileItems: ScannedFile[]

    if (isSingleMediaItem) {
      // Single media item in root of folder
      fileItems = [
        {
          fullpath: libraryItemPath,
          path: libraryItemDir // actually the relPath (only filename here)
        }
      ]
      libraryItemData = {
        path: libraryItemPath, // full path
        relPath: libraryItemDir, // only filename
        mediaMetadata: {
          title: Path.basename(libraryItemDir, Path.extname(libraryItemDir))
        }
      }
    } else {
      fileItems = (await fileUtils.recurseFiles(libraryItemPath)) as ScannedFile[]
      libraryItemData = scanUtils.getDataFromMediaDir(library.mediaType, libraryFolderPath, libraryItemDir)
    }

    const libraryFiles: LibraryFileShape[] = []
    for (let i = 0; i < fileItems.length; i++) {
      const fileItem = fileItems[i]

      if (Watcher.checkShouldIgnoreFilePath(fileItem.fullpath)) {
        // Skip file if it's pending
        Logger.info(`[LibraryItemScanner] Skipping watcher pending file "${fileItem.fullpath}" during scan of library item path "${libraryItemPath}"`)
        continue
      }

      const newLibraryFile = new LibraryFile() as LibraryFileShape
      // fileItem.path is the relative path
      await newLibraryFile.setDataFromPath(fileItem.fullpath, fileItem.path)
      libraryFiles.push(newLibraryFile)
    }

    // getFileTimestampsWithIno returns false on filesystem failure; preserve the existing
    // failure behavior when the caller dereferences the unsuccessful result below.
    const libraryItemStats = (await fileUtils.getFileTimestampsWithIno(libraryItemData.path)) as FileStats
    return new LibraryItemScanData({
      libraryFolderId: folder.id,
      libraryId: library.id,
      mediaType: library.mediaType,
      ino: libraryItemStats.ino,
      mtimeMs: libraryItemStats.mtimeMs || 0,
      ctimeMs: libraryItemStats.ctimeMs || 0,
      birthtimeMs: libraryItemStats.birthtimeMs || 0,
      path: libraryItemData.path,
      relPath: libraryItemData.relPath,
      isFile: isSingleMediaItem,
      mediaMetadata: libraryItemData.mediaMetadata || null,
      libraryFiles
    })
  }

  rescanLibraryItemMedia(existingLibraryItem: ExistingLibraryItem, libraryItemData: LibraryItemScanDataInstance, librarySettings: LibrarySettings, libraryScan: ScanLifecycle): Promise<RescanResult> {
    if (existingLibraryItem.mediaType === 'book') {
      return BookScanner.rescanExistingBookLibraryItem(existingLibraryItem, libraryItemData, librarySettings, libraryScan)
    } else {
      return PodcastScanner.rescanExistingPodcastLibraryItem(existingLibraryItem, libraryItemData, librarySettings, libraryScan)
    }
  }

  async scanNewLibraryItem(libraryItemData: LibraryItemScanDataInstance, librarySettings: LibrarySettings, libraryScan: ScanLifecycle): Promise<ExistingLibraryItem | null> {
    let newLibraryItem: ExistingLibraryItem | null = null
    if (libraryItemData.mediaType === 'book') {
      newLibraryItem = await BookScanner.scanNewBookLibraryItem(libraryItemData, librarySettings, libraryScan)
    } else {
      newLibraryItem = await PodcastScanner.scanNewPodcastLibraryItem(libraryItemData, librarySettings, libraryScan)
    }
    if (newLibraryItem) {
      libraryScan.addLog(LogLevel.INFO, `Created new library item "${newLibraryItem.relPath}" with id "${newLibraryItem.id}"`)
    }
    return newLibraryItem
  }

  async scanPotentialNewLibraryItem(libraryItemPath: string, library: LibraryRecord, folder: LibraryFolderRecord, isSingleMediaItem: boolean): Promise<ExistingLibraryItem | null> {
    const libraryItemScanData = await this.getLibraryItemScanData(libraryItemPath, library, folder, isSingleMediaItem)

    if (!libraryItemScanData.libraryFiles.length) {
      Logger.info(`[LibraryItemScanner] Library item at path "${libraryItemPath}" has no files - ignoring`)
      return null
    }

    const scanLogger = new ScanLogger()
    scanLogger.verbose = true
    scanLogger.setData('libraryItem', libraryItemScanData.relPath)

    const newLibraryItem = await this.scanNewLibraryItem(libraryItemScanData, library.settings, scanLogger)
    // Watcher path does not go through full-library scan cleanup — emit author book count updates here
    await BookScanner.emitAuthorsNumBooksUpdated(library.id, scanLogger)
    return newLibraryItem
  }
}

module.exports = new LibraryItemScanner()
