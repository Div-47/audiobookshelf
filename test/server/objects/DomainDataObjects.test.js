const { expect } = require('chai')
const Backup = require('../../../server/objects/Backup')
const DeviceInfo = require('../../../server/objects/DeviceInfo')
const Notification = require('../../../server/objects/Notification')
const Task = require('../../../server/objects/Task')
const TrackProgressMonitor = require('../../../server/objects/TrackProgressMonitor')

describe('domain data objects', () => {
  it('normalizes legacy backup keys and builds backup paths', () => {
    const backup = new Backup({ details: ['backup-id', '1', '1700000000000', '1.2.3'], fullPath: '/data/backups/backup.audiobookshelf' })
    expect(backup.key).to.equal(null)
    expect(backup.filename).to.equal('backup.audiobookshelf')
    expect(backup.toJSON().path).to.equal('backups/backup.audiobookshelf')
  })

  it('sanitizes stored device names and preserves generated device descriptions', () => {
    const device = new DeviceInfo({ id: 'device-id', model: '<b>Reader</b>', clientVersion: '1.0' })
    expect(device.model).to.equal('Reader')
    expect(device.deviceDescription).to.equal('Reader / v1.0')
    expect(device.toJSON()).not.to.have.property('ipAddress')
  })

  it('resets failure state when enabling a notification and expands template values', () => {
    const notification = new Notification({ id: 'n1', eventName: 'item_added', urls: ['url'], enabled: false, lastAttemptFailed: true, numConsecutiveFailedAttempts: 3, titleTemplate: 'Added {{ title }}' })
    notification.update({ enabled: true })
    expect(notification.lastAttemptFailed).to.equal(false)
    expect(notification.numConsecutiveFailedAttempts).to.equal(0)
    expect(notification.parseTitleTemplate({ title: 'Book' })).to.equal('Added Book')
  })

  it('records task completion and failure timestamps', () => {
    const task = new Task()
    task.setData('scan', { text: 'Scanning', key: 'task.scanning' }, null, true, { libraryId: 'lib' })
    task.setFailed({ text: 'Failed', key: 'task.failed' })
    const json = task.toJSON()
    expect(json.action).to.equal('scan')
    expect(json.isFailed).to.equal(true)
    expect(json.isFinished).to.equal(true)
    expect(json.data).to.deep.equal({ libraryId: 'lib' })
  })

  it('tracks per-track progress and completion callbacks', () => {
    const started = []
    const finished = []
    const progress = []
    const monitor = new TrackProgressMonitor([10, 30], (index) => started.push(index), (...args) => progress.push(args), (index) => finished.push(index))
    monitor.update(25)
    monitor.finish()
    expect(started).to.deep.equal([0, 1])
    expect(finished).to.deep.equal([0, 1])
    expect(progress[0][0]).to.equal(1)
  })
})
