import Path from 'path'
import Logger from '../../Logger'
const fsExtra: any = require('../../libs/fsExtra')
const fileUtils = require('../fileUtils')
import LibraryFile from '../../objects/files/LibraryFile'

async function writeMetadataFileForItem(libraryItem: any): Promise<boolean | null> {
  const storeMetadataWithItem = (global as any).ServerSettings.storeMetadataWithItem && !libraryItem.isFile
  const metadataPath = storeMetadataWithItem ? libraryItem.path : Path.join((global as any).MetadataPath, 'items', libraryItem.id)
  const metadataFilepath = fileUtils.filePathToPOSIX(Path.join(metadataPath, 'metadata.json'))
  if (await fsExtra.pathExists(metadataFilepath)) {
    // Metadata file already exists do nothing
    return null
  }
  Logger.info(`[absMetadataMigration] metadata file not found at "${metadataFilepath}" - creating`)

  if (!storeMetadataWithItem) {
    // Ensure /metadata/items/<lid> dir
    await fsExtra.ensureDir(metadataPath)
  }

  const metadataJson = libraryItem.media.getAbsMetadataJson()

  // Save to file
  const success = await fsExtra
    .writeFile(metadataFilepath, JSON.stringify(metadataJson, null, 2))
    .then(() => true)
    .catch((error: any) => {
      Logger.error(`[absMetadataMigration] failed to save metadata file at "${metadataFilepath}"`, error.message || error)
      return false
    })

  if (!success) return false
  if (!storeMetadataWithItem) return true // No need to do anything else

  // Safety check to make sure library file with the same path isnt already there
  libraryItem.libraryFiles = libraryItem.libraryFiles.filter((lf: any) => lf.metadata.path !== metadataFilepath)

  // Put new library file in library item
  const newLibraryFile = new LibraryFile()
  await newLibraryFile.setDataFromPath(metadataFilepath, 'metadata.json')
  libraryItem.libraryFiles.push(newLibraryFile.toJSON())

  // Update library item timestamps and total size
  const libraryItemDirTimestamps = await fileUtils.getFileTimestampsWithIno(libraryItem.path)
  if (libraryItemDirTimestamps) {
    libraryItem.mtime = libraryItemDirTimestamps.mtimeMs
    libraryItem.ctime = libraryItemDirTimestamps.ctimeMs
    let size = 0
    libraryItem.libraryFiles.forEach((lf: any) => (size += !isNaN(lf.metadata.size) ? Number(lf.metadata.size) : 0))
    libraryItem.size = size
  }

  libraryItem.changed('libraryFiles', true)
  return libraryItem
    .save()
    .then(() => true)
    .catch((error: any) => {
      Logger.error(`[absMetadataMigration] failed to save libraryItem "${libraryItem.id}"`, error.message || error)
      return false
    })
}

async function runMigration(Database: any, offset = 0, totalCreated = 0): Promise<number> {
  const libraryItems = await Database.libraryItemModel.getLibraryItemsIncrement(offset, 500, { isMissing: false })
  if (!libraryItems.length) return totalCreated

  let numCreated = 0
  for (const libraryItem of libraryItems) {
    const success = await writeMetadataFileForItem(libraryItem)
    if (success) numCreated++
  }

  if (libraryItems.length < 500) {
    return totalCreated + numCreated
  }
  return runMigration(Database, offset + libraryItems.length, totalCreated + numCreated)
}

export async function migrate(Database: any): Promise<void> {
  Logger.info(`[absMetadataMigration] Starting metadata.json migration`)
  const totalCreated = await runMigration(Database)
  Logger.info(`[absMetadataMigration] Finished metadata.json migration (${totalCreated} files created)`)
}

const absMetadataMigration = {
  migrate
}

export default absMetadataMigration
module.exports = absMetadataMigration
