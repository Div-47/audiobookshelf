const SocketAuthority = require('../SocketAuthority')
const Task = require('../objects/Task')

export interface TaskString { text: string; key: string; subs?: (string | number)[] | any[] }

export interface TaskRecord {
  id: string | null
  toJSON(): unknown
  setData(action: string, title: TaskString, description: TaskString | null, showSuccess: boolean, data?: Record<string, unknown> | any): void
  setFailed(error: TaskString): void
  setFinished(message?: TaskString): void
  [key: string]: any
}

/**
 * @typedef TaskString
 * @property {string} text
 * @property {string} key
 * @property {string[]} [subs]
 */

class TaskManager {
  tasks: TaskRecord[]

  constructor() {
    /** @type {Task[]} */
    this.tasks = []
  }

  /**
   * Add task and emit socket task_started event
   *
   * @param {Task} task
   */
  addTask(task: any): void {
    this.tasks.push(task)
    SocketAuthority.emitter('task_started', task.toJSON())
  }

  /**
   * Remove task and emit task_finished event
   *
   * @param {Task} task
   */
  taskFinished(task: any): void {
    if (this.tasks.some((t) => t.id === task.id)) {
      this.tasks = this.tasks.filter((t) => t.id !== task.id)
      SocketAuthority.emitter('task_finished', task.toJSON())
    }
  }

  /**
   * Create new task and add
   *
   * @param {string} action
   * @param {TaskString} titleString
   * @param {TaskString|null} descriptionString
   * @param {boolean} showSuccess
   * @param {Object} [data]
   */
  createAndAddTask(action: string, titleString: TaskString, descriptionString: TaskString | null, showSuccess: boolean, data: any = {}): TaskRecord {
    const task = new Task()
    task.setData(action, titleString, descriptionString, showSuccess, data || {})
    this.addTask(task)
    return task
  }

  /**
   * Create new failed task and add
   *
   * @param {string} action
   * @param {TaskString} titleString
   * @param {TaskString|null} descriptionString
   * @param {TaskString} errorMessageString
   */
  createAndEmitFailedTask(action: string, titleString: TaskString, descriptionString: TaskString | null, errorMessageString: TaskString): TaskRecord {
    const task = new Task()
    task.setData(action, titleString, descriptionString, false)
    task.setFailed(errorMessageString)
    SocketAuthority.emitter('task_started', task.toJSON())
    return task
  }
}

const instance = new TaskManager()
export default instance
module.exports = instance

