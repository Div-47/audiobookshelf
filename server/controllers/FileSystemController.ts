const Path = require('path')
const Logger = require('../Logger')
const fs = require('../libs/fsExtra')
const { toNumber } = require('../utils/index')
const fileUtils = require('../utils/fileUtils')
const Database = require('../Database')
import type { ControllerRequest, ControllerResponse } from '../types/ControllerHttp'

interface FileSystemRequest extends ControllerRequest<{ directory?: string | { length?: number } | null; folderPath?: string | { length?: number } | null }> {
  query: Record<string, string | undefined> & { level?: string; path?: string }
  user: ControllerRequest['user'] & { canUpload?: boolean; checkCanAccessLibrary(libraryId: string): boolean }
}
const runtimeGlobals = global as typeof globalThis & { isWin?: boolean; appRoot: string }

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class FileSystemController {
  constructor() {}

  /**
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getPaths(req: FileSystemRequest, res: ControllerResponse): Promise<unknown> {
    if (!req.user.isAdminOrUp) {
      Logger.error(`[FileSystemController] Non-admin user "${req.user.username}" attempting to get filesystem paths`)
      return res.sendStatus(403)
    }

    const relpath = req.query.path
    const level = toNumber(req.query.level, 0)

    // Validate path. Must be absolute
    if (relpath && (!Path.isAbsolute(relpath) || !(await fs.pathExists(relpath)))) {
      Logger.error(`[FileSystemController] Invalid path in query string "${relpath}"`)
      return res.status(400).send('Invalid "path" query string')
    }
    Logger.debug(`[FileSystemController] Getting file paths at ${relpath || 'root'} (${level})`)

    let directories: Array<{ path: string; dirname: string; level: number }> = []

    // Windows returns drives first
    if (runtimeGlobals.isWin) {
      if (relpath) {
        directories = await fileUtils.getDirectoriesInPath(relpath, level)
      } else {
        const drives: string[] = await fileUtils.getWindowsDrives().catch((error: Error) => {
          Logger.error(`[FileSystemController] Failed to get windows drives`, error)
          return []
        })
        if (drives.length) {
          directories = drives.map((d: string) => {
            return {
              path: d,
              dirname: d,
              level: 0
            }
          })
        }
      }
    } else {
      directories = await fileUtils.getDirectoriesInPath(relpath || '/', level)
    }

    // Exclude some dirs from this project to be cleaner in Docker
    const excludedDirs = ['node_modules', 'client', 'server', '.git', 'static', 'build', 'dist', 'metadata', 'config', 'sys', 'proc', '.devcontainer', '.nyc_output', '.github', '.vscode'].map((dirname) => {
      return fileUtils.filePathToPOSIX(Path.join(runtimeGlobals.appRoot, dirname))
    })
    directories = directories.filter((dir) => {
      return !excludedDirs.includes(dir.path)
    })

    res.json({
      posix: !runtimeGlobals.isWin,
      directories
    })
  }

  /**
   * POST: /api/filesystem/pathexists
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async checkPathExists(req: FileSystemRequest, res: ControllerResponse): Promise<unknown> {
    if (!req.user.canUpload) {
      Logger.error(`[FileSystemController] User "${req.user.username}" without upload permissions attempting to check path exists`)
      return res.sendStatus(403)
    }

    const { directory, folderPath } = req.body
    if (!directory?.length || typeof directory !== 'string' || !folderPath?.length || typeof folderPath !== 'string') {
      Logger.error(`[FileSystemController] Invalid request body: ${JSON.stringify(req.body)}`)
      return res.status(400).json({
        error: 'Invalid request body'
      })
    }

    // Check that library folder exists
    const libraryFolder = await Database.libraryFolderModel.findOne({
      where: {
        path: folderPath
      }
    })

    if (!libraryFolder) {
      Logger.error(`[FileSystemController] Library folder not found: ${folderPath}`)
      return res.sendStatus(404)
    }

    if (!req.user.checkCanAccessLibrary(libraryFolder.libraryId)) {
      Logger.error(`[FileSystemController] User "${req.user.username}" attempting to check path exists for library "${libraryFolder.libraryId}" without access`)
      return res.sendStatus(403)
    }

    let filepath = Path.join(libraryFolder.path, directory)
    filepath = fileUtils.filePathToPOSIX(filepath)

    // Ensure filepath is inside library folder (prevents directory traversal)
    if (!fileUtils.isSameOrSubPath(libraryFolder.path, filepath)) {
      Logger.error(`[FileSystemController] Filepath is not inside library folder: ${filepath}`)
      return res.sendStatus(400)
    }

    if (await fs.pathExists(filepath)) {
      return res.json({
        exists: true
      })
    }

    // Check if a library item exists in a subdirectory
    // See: https://github.com/advplyr/audiobookshelf/issues/4146
    const cleanedDirectory = directory.split('/').filter(Boolean).join('/')
    if (cleanedDirectory.includes('/')) {
      // Can only be 2 levels deep
      const possiblePaths = []
      const subdir = Path.dirname(directory)
      possiblePaths.push(fileUtils.filePathToPOSIX(Path.join(folderPath, subdir)))
      if (subdir.includes('/')) {
        possiblePaths.push(fileUtils.filePathToPOSIX(Path.join(folderPath, Path.dirname(subdir))))
      }

      const libraryItem = await Database.libraryItemModel.findOne({
        where: {
          path: possiblePaths
        }
      })

      if (libraryItem) {
        return res.json({
          exists: true,
          libraryItemTitle: libraryItem.title
        })
      }
    }

    return res.json({
      exists: false
    })
  }
}
module.exports = new FileSystemController()
