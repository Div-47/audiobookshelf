const chai = require('chai')
const expect = chai.expect
const fs = require('fs/promises')
const os = require('os')
const Path = require('path')
const LibraryScanner = require('../../../server/scanner/LibraryScanner')

describe('LibraryScanner', () => {
  it('groups watcher updates by folder while retaining library and update data', () => {
    const updates = [
      { path: '/library-a/one.mp3', relPath: '/one.mp3', folderId: 'folder-a', libraryId: 'library-a', type: 'add' },
      { path: '/library-b/two.mp3', relPath: '/two.mp3', folderId: 'folder-b', libraryId: 'library-b', type: 'remove' },
      { path: '/library-a/three.mp3', relPath: '/three.mp3', folderId: 'folder-a', libraryId: 'library-a', type: 'change' }
    ]

    expect(LibraryScanner.getFileUpdatesGrouped(updates)).to.deep.equal({
      'folder-a': { libraryId: 'library-a', folderId: 'folder-a', fileUpdates: [updates[0], updates[2]] },
      'folder-b': { libraryId: 'library-b', folderId: 'folder-b', fileUpdates: [updates[1]] }
    })
  })

  it('tracks cancellation only for active full-library scans', () => {
    const libraryId = 'cancel-test-library'
    const scan = {
      libraryId,
      resultStats: '0 Added | 0 Updated | 0 Missing',
      addLog() {}
    }

    LibraryScanner.cancelLibraryScan[libraryId] = undefined
    expect(LibraryScanner.isLibraryScanning(libraryId)).to.equal(false)
    LibraryScanner.setCancelLibraryScan(libraryId)
    expect(LibraryScanner.cancelLibraryScan[libraryId]).to.equal(undefined)

    LibraryScanner.librariesScanning.push(libraryId)
    LibraryScanner.setCancelLibraryScan(libraryId)
    expect(LibraryScanner.shouldCancelScan(scan)).to.equal(true)
    delete LibraryScanner.cancelLibraryScan[libraryId]
    LibraryScanner.librariesScanning = LibraryScanner.librariesScanning.filter((id) => id !== libraryId)
  })

  it('scans root-level and directory-based items into library scan data', async () => {
    const originalIsWin = global.isWin
    const originalServerSettings = global.ServerSettings
    const tempDir = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-library-scanner-'))
    try {
      global.isWin = false
      global.ServerSettings = { scannerParseSubtitle: true }
      await fs.mkdir(Path.join(tempDir, 'Author', 'Book'), { recursive: true })
      await fs.writeFile(Path.join(tempDir, 'Root.m4b'), 'root audio')
      await fs.writeFile(Path.join(tempDir, 'Author', 'Book', 'chapter.mp3'), 'chapter audio')

      const folderPath = await fs.realpath(tempDir)
      const library = {
        id: 'library-1',
        name: 'Books',
        mediaType: 'book',
        settings: { audiobooksOnly: false },
        libraryFolders: [{ id: 'folder-1', libraryId: 'library-1', path: folderPath }],
        isBook: true,
        lastScanMetadataPrecedence: [],
        extraData: {},
        changed() {},
        async save() {},
        toJSON() { return { id: this.id, name: this.name } }
      }

      const items = await LibraryScanner.scanFolder(library, library.libraryFolders[0])
      const rootItem = items.find((item) => item.relPath === 'Root.m4b')
      const directoryItem = items.find((item) => item.relPath === 'Author/Book')

      expect(items).to.have.length(2)
      expect(rootItem.isFile).to.equal(true)
      expect(rootItem.mediaMetadata.title).to.equal('Root')
      expect(directoryItem.isFile).to.equal(false)
      expect(directoryItem.mediaMetadata).to.include({ title: 'Book' })
      expect(directoryItem.mediaMetadata.authors).to.deep.equal(['Author'])
      expect(directoryItem.libraryFiles.map((file) => file.metadata.filename)).to.deep.equal(['chapter.mp3'])
    } finally {
      global.isWin = originalIsWin
      global.ServerSettings = originalServerSettings
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
