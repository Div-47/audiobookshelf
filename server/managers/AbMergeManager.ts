import Path from 'path'
const fs: any = require('../libs/fsExtra')
import Logger from '../Logger'
import TaskManager from './TaskManager'
import Task from '../objects/Task'
import ffmpegHelpers from '../utils/ffmpegHelpers'
const Ffmpeg: any = require('../libs/fluentFfmpeg')
import SocketAuthority from '../SocketAuthority'
const { isWritable, copyToExisting } = require('../utils/fileUtils')
const TrackProgressMonitor: any = require('../objects/TrackProgressMonitor')

export interface AbMergeEncodeOptions {
  codec?: string
  channels?: string
  bitrate?: string
}

export interface PendingMergeTask {
  id: string
  task: any
}

export class AbMergeManager {
  itemsCacheDir: string
  pendingTasks: PendingMergeTask[]

  constructor() {
    this.itemsCacheDir = Path.join((global as any).MetadataPath, 'cache/items')
    this.pendingTasks = []
  }

  getPendingTaskByLibraryItemId(libraryItemId: string): PendingMergeTask | undefined {
    return this.pendingTasks.find((t) => t.task.data.libraryItemId === libraryItemId)
  }

  cancelEncode(task: any): Promise<void> {
    const taskFailedString = {
      text: 'Task canceled by user',
      key: 'MessageTaskCanceledByUser'
    }
    task.setFailed(taskFailedString)
    return this.removeTask(task, true)
  }

  async startAudiobookMerge(userId: string, libraryItem: any, options: AbMergeEncodeOptions = {}): Promise<void> {
    const task = new Task()

    const audiobookBaseName = libraryItem.isFile ? Path.basename(libraryItem.path, Path.extname(libraryItem.path)) : Path.basename(libraryItem.path)
    const targetFilename = audiobookBaseName + '.m4b'
    const itemCachePath = Path.join(this.itemsCacheDir, libraryItem.id)
    const tempFilepath = Path.join(itemCachePath, targetFilename)
    const ffmetadataPath = Path.join(itemCachePath, 'ffmetadata.txt')
    const libraryItemDir = libraryItem.isFile ? Path.dirname(libraryItem.path) : libraryItem.path
    const taskData = {
      libraryItemId: libraryItem.id,
      libraryItemDir,
      userId,
      originalTrackPaths: libraryItem.media.includedAudioFiles.map((t: any) => t.metadata.path),
      inos: libraryItem.media.includedAudioFiles.map((f: any) => f.ino),
      tempFilepath,
      targetFilename,
      targetFilepath: Path.join(libraryItemDir, targetFilename),
      itemCachePath,
      ffmetadataObject: ffmpegHelpers.getFFMetadataObject(libraryItem, 1),
      chapters: libraryItem.media.chapters?.map((c: any) => ({ ...c })),
      coverPath: libraryItem.media.coverPath,
      ffmetadataPath,
      duration: libraryItem.media.duration,
      encodeOptions: options
    }

    const taskTitleString = {
      text: 'Encoding M4b',
      key: 'MessageTaskEncodingM4b'
    }
    const taskDescriptionString = {
      text: `Encoding audiobook "${libraryItem.media.title}" into a single m4b file.`,
      key: 'MessageTaskEncodingM4bDescription',
      subs: [libraryItem.media.title]
    }
    task.setData('encode-m4b', taskTitleString, taskDescriptionString, false, taskData as any)
    TaskManager.addTask(task)
    Logger.info(`Start m4b encode for ${libraryItem.id} - TaskId: ${task.id}`)

    if (!(await fs.pathExists(taskData.itemCachePath))) {
      await fs.mkdir(taskData.itemCachePath)
    }

    this.runAudiobookMerge(libraryItem, task, options || {})
  }

  async runAudiobookMerge(libraryItem: any, task: any, encodingOptions: AbMergeEncodeOptions): Promise<void> {
    // Make sure the target directory is writable
    if (!(await isWritable(task.data.libraryItemDir))) {
      Logger.error(`[AbMergeManager] Target directory is not writable: ${task.data.libraryItemDir}`)
      const taskFailedString = {
        text: 'Target directory is not writable',
        key: 'MessageTaskTargetDirectoryNotWritable'
      }
      task.setFailed(taskFailedString)
      this.removeTask(task, true)
      return
    }

    // Create ffmetadata file
    if (!(await ffmpegHelpers.writeFFMetadataFile(task.data.ffmetadataObject, task.data.chapters, task.data.ffmetadataPath))) {
      Logger.error(`[AudioMetadataManager] Failed to write ffmetadata file for audiobook "${task.data.libraryItemId}"`)
      const taskFailedString = {
        text: 'Failed to write metadata file',
        key: 'MessageTaskFailedToWriteMetadataFile'
      }
      task.setFailed(taskFailedString)
      this.removeTask(task, true)
      return
    }

    this.pendingTasks.push({
      id: task.id,
      task
    })

    const encodeFraction = 0.95
    const embedFraction = 1 - encodeFraction
    try {
      const trackProgressMonitor = new TrackProgressMonitor(
        libraryItem.media.includedAudioFiles.map((t: any) => t.duration),
        (trackIndex: number) => SocketAuthority.adminEmitter('track_started', { libraryItemId: libraryItem.id, ino: task.data.inos[trackIndex] }),
        (trackIndex: number, progressInTrack: number, taskProgress: number) => {
          SocketAuthority.adminEmitter('track_progress', { libraryItemId: libraryItem.id, ino: task.data.inos[trackIndex], progress: progressInTrack })
          SocketAuthority.adminEmitter('task_progress', { libraryItemId: libraryItem.id, progress: taskProgress * encodeFraction })
        },
        (trackIndex: number) => SocketAuthority.adminEmitter('track_finished', { libraryItemId: libraryItem.id, ino: task.data.inos[trackIndex] })
      )
      task.data.ffmpeg = new Ffmpeg()
      await ffmpegHelpers.mergeAudioFiles(libraryItem.media.includedAudioFiles, task.data.duration, task.data.itemCachePath, task.data.tempFilepath, encodingOptions, (progress: number) => trackProgressMonitor.update(progress), task.data.ffmpeg)
      delete task.data.ffmpeg
      trackProgressMonitor.finish()
    } catch (error: any) {
      if (error.message === 'FFMPEG_CANCELED') {
        Logger.info(`[AbMergeManager] Task cancelled ${task.id}`)
      } else {
        Logger.error(`[AbMergeManager] mergeAudioFiles failed`, error)
        const taskFailedString = {
          text: 'Failed to merge audio files',
          key: 'MessageTaskFailedToMergeAudioFiles'
        }
        task.setFailed(taskFailedString)
        this.removeTask(task, true)
      }
      return
    }

    // Write metadata to merged file
    try {
      task.data.ffmpeg = new Ffmpeg()
      await ffmpegHelpers.addCoverAndMetadataToFile(
        task.data.tempFilepath,
        task.data.coverPath,
        task.data.ffmetadataPath,
        1,
        'audio/mp4',
        (progress: number) => {
          Logger.debug(`[AbMergeManager] Embedding metadata progress: ${100 * encodeFraction + progress * embedFraction}`)
          SocketAuthority.adminEmitter('task_progress', { libraryItemId: libraryItem.id, progress: 100 * encodeFraction + progress * embedFraction })
        },
        task.data.ffmpeg
      )
      delete task.data.ffmpeg
    } catch (error: any) {
      if (error.message === 'FFMPEG_CANCELED') {
        Logger.info(`[AbMergeManager] Task cancelled ${task.id}`)
      } else {
        Logger.error(`[AbMergeManager] Failed to embed metadata in file "${task.data.tempFilepath}"`)
        const taskFailedString = {
          text: `Failed to embed metadata in file ${Path.basename(task.data.tempFilepath)}`,
          key: 'MessageTaskFailedToEmbedMetadataInFile',
          subs: [Path.basename(task.data.tempFilepath)]
        }
        task.setFailed(taskFailedString)
        this.removeTask(task, true)
      }
      return
    }

    // Move library item tracks to cache
    for (let index = 0; index < task.data.originalTrackPaths.length; index++) {
      const trackPath = task.data.originalTrackPaths[index]
      const trackFilename = Path.basename(trackPath)
      let moveToPath = Path.join(task.data.itemCachePath, trackFilename)

      // If the track is the same as the temp file, we need to rename it to avoid overwriting it
      if (task.data.tempFilepath === moveToPath) {
        const trackExtname = Path.extname(task.data.tempFilepath)
        const newTrackFilename = Path.basename(task.data.tempFilepath, trackExtname) + '.backup' + trackExtname
        moveToPath = Path.join(task.data.itemCachePath, newTrackFilename)
      }

      Logger.debug(`[AbMergeManager] Backing up original track "${trackPath}" to ${moveToPath}`)
      if (index === 0) {
        // copy the first track to the cache directory
        await fs.copy(trackPath, moveToPath).catch((err: any) => {
          Logger.error(`[AbMergeManager] Failed to copy track "${trackPath}" to "${moveToPath}"`, err)
        })
      } else {
        // move the rest of the tracks to the cache directory
        await fs.move(trackPath, moveToPath, { overwrite: true }).catch((err: any) => {
          Logger.error(`[AbMergeManager] Failed to move track "${trackPath}" to "${moveToPath}"`, err)
        })
      }
    }

    // Move m4b to target, preserving the original track's permissions
    Logger.debug(`[AbMergeManager] Moving m4b from ${task.data.tempFilepath} to ${task.data.targetFilepath}`)
    try {
      const firstOriginalTrackPath = task.data.originalTrackPaths[0]
      await copyToExisting(task.data.tempFilepath, firstOriginalTrackPath)
      await fs.rename(firstOriginalTrackPath, task.data.targetFilepath)
      await fs.remove(task.data.tempFilepath)
    } catch (err: any) {
      Logger.error(`[AbMergeManager] Failed to move m4b from ${task.data.tempFilepath} to ${task.data.targetFilepath}`, err)
      const taskFailedString = {
        text: 'Failed to move m4b file',
        key: 'MessageTaskFailedToMoveM4bFile'
      }
      task.setFailed(taskFailedString)
      this.removeTask(task, true)
      return
    }

    // Remove ffmetadata file
    await fs.remove(task.data.ffmetadataPath)

    task.setFinished()
    await this.removeTask(task, false)
    Logger.info(`[AbMergeManager] Ab task finished ${task.id}`)
  }

  async removeTask(task: any, removeTempFilepath = false): Promise<void> {
    Logger.info('[AbMergeManager] Removing task ' + task.id)

    const pendingTask = this.pendingTasks.find((d) => d.id === task.id)
    if (pendingTask) {
      this.pendingTasks = this.pendingTasks.filter((d) => d.id !== task.id)
      if (task.data.ffmpeg) {
        Logger.warn(`[AbMergeManager] Killing ffmpeg process for task ${task.id}`)
        task.data.ffmpeg.kill()
        // wait for ffmpeg to exit, so that the output file is unlocked
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    if (removeTempFilepath) {
      // On failed tasks remove the bad file if it exists
      if (await fs.pathExists(task.data.tempFilepath)) {
        await fs
          .remove(task.data.tempFilepath)
          .then(() => {
            Logger.info('[AbMergeManager] Deleted target file', task.data.tempFilepath)
          })
          .catch((err: any) => {
            Logger.error('[AbMergeManager] Failed to delete target file', err)
          })
      }
      if (await fs.pathExists(task.data.ffmetadataPath)) {
        await fs
          .remove(task.data.ffmetadataPath)
          .then(() => {
            Logger.info('[AbMergeManager] Deleted ffmetadata file', task.data.ffmetadataPath)
          })
          .catch((err: any) => {
            Logger.error('[AbMergeManager] Failed to delete ffmetadata file', err)
          })
      }
    }

    TaskManager.taskFinished(task)
  }
}

export default AbMergeManager
module.exports = AbMergeManager
