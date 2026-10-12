const chai = require('chai')
const expect = chai.expect
const LibraryItemScanData = require('../../../server/scanner/LibraryItemScanData')

function makeFile(path, ino, ext = '.mp3', size = 100) {
  return {
    ino,
    isSupplementary: null,
    isEBookFile: ext === '.epub',
    addedAt: 1,
    updatedAt: 1,
    metadata: {
      filename: path.split('/').pop(),
      ext,
      path: `/library/book/${path}`,
      relPath: path,
      size,
      mtimeMs: 1,
      ctimeMs: 1,
      birthtimeMs: 1
    },
    toJSON() {
      return {
        ino: this.ino,
        isSupplementary: this.isSupplementary,
        addedAt: this.addedAt,
        updatedAt: this.updatedAt,
        metadata: { ...this.metadata }
      }
    }
  }
}

function makeExistingItem(files = []) {
  return {
    libraryFolderId: 'folder-1',
    libraryId: 'library-1',
    mediaType: 'book',
    ino: 'directory-ino',
    path: '/library/book',
    relPath: 'book',
    isFile: false,
    isMissing: false,
    mtime: new Date(10),
    ctime: new Date(20),
    birthtime: new Date(30),
    size: 0,
    libraryFiles: files,
    changed() { return ['libraryFiles'] },
    async save() { this.saved = true }
  }
}

function makeScanData(files) {
  return new LibraryItemScanData({
    libraryFolderId: 'folder-1',
    libraryId: 'library-1',
    mediaType: 'book',
    ino: 'directory-ino',
    mtimeMs: 10,
    ctimeMs: 20,
    birthtimeMs: 30,
    path: '/library/book',
    relPath: 'book',
    isFile: false,
    mediaMetadata: { title: 'Book' },
    libraryFiles: files
  })
}

const scanLog = { addLog() {} }

describe('LibraryItemScanData', () => {
  it('matches renamed files by inode, updates path and reports the modification', async () => {
    const oldFile = makeFile('old.mp3', 'audio-inode')
    const newFile = makeFile('new.mp3', 'audio-inode')
    const existing = makeExistingItem([oldFile.toJSON()])
    const data = makeScanData([newFile])

    expect(await data.checkLibraryItemData(existing, scanLog)).to.equal(true)
    expect(existing.libraryFiles[0].metadata.path).to.equal('/library/book/new.mp3')
    expect(data.libraryFilesModified).to.have.length(1)
    expect(data.libraryFilesRemoved).to.have.length(0)
    expect(data.libraryFilesAdded).to.have.length(0)
    expect(existing.saved).to.equal(true)
  })

  it('marks newly discovered ebooks supplementary and records removed files', async () => {
    const oldAudio = makeFile('old.mp3', 'old-inode')
    const newEbook = makeFile('book.epub', 'ebook-inode', '.epub', 250)
    const existing = makeExistingItem([oldAudio.toJSON()])
    const data = makeScanData([newEbook])

    expect(await data.checkLibraryItemData(existing, scanLog)).to.equal(true)
    expect(data.libraryFilesRemoved).to.have.length(1)
    expect(data.libraryFilesAdded).to.deep.equal([newEbook])
    expect(newEbook.isSupplementary).to.equal(true)
    expect(existing.libraryFiles[0].isSupplementary).to.equal(true)
    expect(existing.size).to.equal(250)
  })

  it('does not save unchanged scan data', async () => {
    const file = makeFile('audio.mp3', 'audio-inode')
    const existing = makeExistingItem([file.toJSON()])
    const data = makeScanData([makeFile('audio.mp3', 'audio-inode')])

    expect(await data.checkLibraryItemData(existing, scanLog)).to.equal(false)
    expect(existing.saved).to.equal(undefined)
  })

  it('updates file and item timestamps when the scan detects modifications', async () => {
    const previousFile = makeFile('audio.mp3', 'audio-inode', '.mp3', 100)
    const scannedFile = makeFile('audio.mp3', 'audio-inode', '.mp3', 200)
    const existing = makeExistingItem([previousFile.toJSON()])
    existing.mtime = new Date(9)
    existing.isMissing = true
    const data = makeScanData([scannedFile])

    expect(await data.checkLibraryItemData(existing, scanLog)).to.equal(true)
    expect(existing.mtime.valueOf()).to.equal(10)
    expect(existing.isMissing).to.equal(false)
    expect(existing.libraryFiles[0].metadata.size).to.equal(200)
    expect(data.libraryFilesModified).to.have.length(1)
    expect(existing.saved).to.equal(true)
  })
})
