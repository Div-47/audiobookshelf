const chai = require('chai')
const expect = chai.expect
const fs = require('fs/promises')
const os = require('os')
const Path = require('path')
const LibraryScan = require('../../../server/scanner/LibraryScan')
const ScanLogger = require('../../../server/scanner/ScanLogger')
const { LogLevel } = require('../../../server/utils/constants')

function makeLibrary() {
  return {
    id: 'library-1',
    name: 'Test Library',
    mediaType: 'book',
    libraryFolders: [{ id: 'folder-1', path: '/library' }],
    toJSON() {
      return { id: this.id, name: this.name, mediaType: this.mediaType }
    }
  }
}

describe('scanner lifecycle logging', () => {
  it('tracks full library scan results and writes the scan and log entries as JSON lines', async () => {
    const originalMetadataPath = global.MetadataPath
    const tempDir = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-library-scan-'))
    try {
      global.MetadataPath = tempDir
      await fs.mkdir(Path.join(tempDir, 'logs'))
      const library = makeLibrary()
      const scan = new LibraryScan()
      scan.setData(library)
      scan.resultsAdded = 2
      scan.resultsUpdated = 1
      scan.resultsMissing = 3
      scan.addLog(LogLevel.INFO, 'Found', '4', 'items')
      scan.setComplete()

      expect(scan.libraryId).to.equal(library.id)
      expect(scan.libraryName).to.equal(library.name)
      expect(scan.libraryMediaType).to.equal('book')
      expect(scan.libraryFolders).to.equal(library.libraryFolders)
      expect(scan.elapsed).to.be.a('number')
      expect(scan.resultStats).to.equal('2 Added | 1 Updated | 3 Missing')
      expect(scan.scanResults).to.include({ added: 2, updated: 1, missing: 3, elapsed: scan.elapsed })
      expect(scan.scanResultsString).to.match(/2 added, 1 updated, 3 missing/)
      expect(scan.logs[0]).to.include({ message: 'Found 4 items', level: LogLevel.INFO })
      expect(scan.toJSON().library).to.deep.equal(library.toJSON())

      await scan.saveLog()
      const scanLogDir = Path.join(tempDir, 'logs', 'scans')
      const filename = (await fs.readdir(scanLogDir))[0]
      expect(filename).to.equal(scan.logFilename)
      const lines = (await fs.readFile(Path.join(scanLogDir, filename), 'utf8')).trim().split('\n')
      expect(JSON.parse(lines[0])).to.deep.equal(scan.toJSON())
      expect(JSON.parse(lines[1])).to.deep.equal(scan.logs[0])
    } finally {
      global.MetadataPath = originalMetadataPath
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps the lightweight scan logger shape and shared author/series cleanup state', () => {
    const scan = new ScanLogger()
    scan.setData('libraryItem', 'Author/Book')
    scan.authorsRemovedFromBooks.push('author-1')
    scan.authorsNumBooksChangedIds.add('author-2')
    scan.seriesRemovedFromBooks.push('series-1')
    scan.addLog(LogLevel.WARN, 'Metadata', 'changed')
    scan.setComplete()

    expect(scan.id).to.be.a('string')
    expect(scan.type).to.equal('libraryItem')
    expect(scan.name).to.equal('Author/Book')
    expect(scan.elapsed).to.be.a('number')
    expect(scan.toJSON()).to.include({ type: 'libraryItem', name: 'Author/Book' })
    expect(scan.toJSON()).not.to.have.property('logs')
    expect(scan.logs[0]).to.include({ message: 'Metadata changed', level: LogLevel.WARN })
    expect([...scan.authorsNumBooksChangedIds]).to.deep.equal(['author-2'])
  })
})
