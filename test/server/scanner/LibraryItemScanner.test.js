const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const fs = require('fs/promises')
const os = require('os')
const Path = require('path')
const LibraryItemScanner = require('../../../server/scanner/LibraryItemScanner')
const BookScanner = require('../../../server/scanner/BookScanner')
const PodcastScanner = require('../../../server/scanner/PodcastScanner')
const Watcher = require('../../../server/Watcher')

describe('LibraryItemScanner', () => {
  afterEach(() => sinon.restore())

  it('builds scan data from a media directory and skips watcher-pending files', async () => {
    const originalIsWin = global.isWin
    const originalServerSettings = global.ServerSettings
    const tempDir = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-item-scanner-'))
    let itemPath
    let pendingPath
    try {
      global.isWin = false
      global.ServerSettings = { scannerParseSubtitle: true }
      await fs.mkdir(Path.join(tempDir, 'Author', 'Book'), { recursive: true })
      const libraryRoot = await fs.realpath(tempDir)
      itemPath = await fs.realpath(Path.join(libraryRoot, 'Author', 'Book'))
      pendingPath = Path.join(itemPath, 'pending.mp3')
      await fs.writeFile(Path.join(itemPath, 'chapter.mp3'), 'chapter audio')
      await fs.writeFile(pendingPath, 'pending audio')
      sinon.stub(Watcher, 'checkShouldIgnoreFilePath').callsFake((path) => path.endsWith('pending.mp3'))

      const library = {
        id: 'library-1',
        mediaType: 'book',
        settings: {},
        libraryFolders: []
      }
      const folder = { id: 'folder-1', libraryId: library.id, path: libraryRoot }
      const data = await LibraryItemScanner.getLibraryItemScanData(itemPath, library, folder, false)

      expect(data.libraryId).to.equal('library-1')
      expect(data.libraryFolderId).to.equal('folder-1')
      expect(data.path).to.equal(itemPath)
      expect(data.relPath).to.equal('Author/Book')
      expect(data.mediaMetadata).to.include({ title: 'Book' })
      expect(data.mediaMetadata.authors).to.deep.equal(['Author'])
      expect(data.libraryFiles).to.have.length(1)
      expect(data.libraryFiles[0].metadata.filename).to.equal('chapter.mp3')
      expect(data.libraryFiles[0].metadata.size).to.equal(13)
    } finally {
      global.isWin = originalIsWin
      global.ServerSettings = originalServerSettings
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('routes new and existing media scans to the book or podcast scanner', async () => {
    const bookItem = { id: 'book-item', relPath: 'Books/Book' }
    const podcastItem = { id: 'podcast-item', relPath: 'Podcasts/Show' }
    const bookNew = sinon.stub(BookScanner, 'scanNewBookLibraryItem').resolves(bookItem)
    const podcastNew = sinon.stub(PodcastScanner, 'scanNewPodcastLibraryItem').resolves(podcastItem)
    const bookRescan = sinon.stub(BookScanner, 'rescanExistingBookLibraryItem').resolves({ libraryItem: bookItem, wasUpdated: true })
    const podcastRescan = sinon.stub(PodcastScanner, 'rescanExistingPodcastLibraryItem').resolves({ libraryItem: podcastItem, wasUpdated: false })
    const log = { addLog: sinon.spy() }

    expect(await LibraryItemScanner.scanNewLibraryItem({ mediaType: 'book' }, {}, log)).to.equal(bookItem)
    expect(await LibraryItemScanner.scanNewLibraryItem({ mediaType: 'podcast' }, {}, log)).to.equal(podcastItem)
    expect(log.addLog.callCount).to.equal(2)

    const bookExisting = { mediaType: 'book' }
    const podcastExisting = { mediaType: 'podcast' }
    expect(await LibraryItemScanner.rescanLibraryItemMedia(bookExisting, {}, {}, log)).to.deep.equal({ libraryItem: bookItem, wasUpdated: true })
    expect(await LibraryItemScanner.rescanLibraryItemMedia(podcastExisting, {}, {}, log)).to.deep.equal({ libraryItem: podcastItem, wasUpdated: false })
    expect(bookNew.calledOnce).to.equal(true)
    expect(podcastNew.calledOnce).to.equal(true)
    expect(bookRescan.calledOnce).to.equal(true)
    expect(podcastRescan.calledOnce).to.equal(true)
  })
})
