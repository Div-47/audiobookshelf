const Path = require('path')
const chai = require('chai')
const expect = chai.expect
const scanUtils = require('../../../server/utils/scandir')

describe('scanUtils', async () => {
  let originalIsWin
  let originalServerSettings

  beforeEach(() => {
    originalIsWin = global.isWin
    originalServerSettings = global.ServerSettings
  })

  afterEach(() => {
    global.isWin = originalIsWin
    global.ServerSettings = originalServerSettings
  })

  it('should properly group files into potential book library items', async () => {
    global.isWin = process.platform === 'win32'
    global.ServerSettings = {
      scannerParseSubtitle: true
    }

    const filePaths = [
      'randomfile.txt', // Should be ignored because it's not a book media file
      'Book1.m4b', // Root single file audiobook
      'Book2/audiofile.m4b',
      'Book2/disk 001/audiofile.m4b',
      'Book2/disk 002/audiofile.m4b',
      'Author/Book3/audiofile.mp3',
      'Author/Book3/Disc 1/audiofile.mp3',
      'Author/Book3/Disc 2/audiofile.mp3',
      'Author/Series/Book4/cover.jpg',
      'Author/Series/Book4/CD1/audiofile.mp3',
      'Author/Series/Book4/CD2/audiofile.mp3',
      'Author/Series2/Book5/deeply/nested/cd 01/audiofile.mp3',
      'Author/Series2/Book5/deeply/nested/cd 02/audiofile.mp3',
      'Author/Series2/Book5/randomfile.js' // Should be ignored because it's not a book media file
    ]

    // Create fileItems to match the format of fileUtils.recurseFiles
    const fileItems = []
    for (const filePath of filePaths) {
      const dirname = Path.dirname(filePath)
      fileItems.push({
        name: Path.basename(filePath),
        reldirpath: dirname === '.' ? '' : dirname,
        extension: Path.extname(filePath),
        deep: filePath.split('/').length - 1
      })
    }

    const libraryItemGrouping = scanUtils.groupFileItemsIntoLibraryItemDirs('book', fileItems, false)

    expect(libraryItemGrouping).to.deep.equal({
      'Book1.m4b': 'Book1.m4b',
      Book2: ['audiofile.m4b', 'disk 001/audiofile.m4b', 'disk 002/audiofile.m4b'],
      'Author/Book3': ['audiofile.mp3', 'Disc 1/audiofile.mp3', 'Disc 2/audiofile.mp3'],
      'Author/Series/Book4': ['CD1/audiofile.mp3', 'CD2/audiofile.mp3', 'cover.jpg'],
      'Author/Series2/Book5/deeply/nested': ['cd 01/audiofile.mp3', 'cd 02/audiofile.mp3']
    })
  })

  it('should keep root podcast files out of scan groups and group podcast episodes by directory', () => {
    const fileItems = ['root.mp3', 'Show/Episode 1.mp3', 'Show/cover.jpg'].map((filePath) => {
      const dirname = Path.dirname(filePath)
      return {
        name: Path.basename(filePath),
        reldirpath: dirname === '.' ? '' : dirname,
        extension: Path.extname(filePath),
        deep: filePath.split('/').length - 1
      }
    })

    expect(scanUtils.groupFileItemsIntoLibraryItemDirs('podcast', fileItems, false)).to.deep.equal({
      Show: ['Episode 1.mp3', 'cover.jpg']
    })
    expect(scanUtils.groupFileItemsIntoLibraryItemDirs('podcast', fileItems, false, true)).to.deep.equal({
      Show: ['Episode 1.mp3', 'cover.jpg']
    })
  })

  it('should derive book metadata and normalize Windows paths without changing filename metadata', () => {
    global.isWin = true
    global.ServerSettings = { scannerParseSubtitle: true }

    const result = scanUtils.getDataFromMediaDir('book', 'C:\\Books', 'Author\\Series\\Book 2 - Title - Subtitle {Narrator Name} [B0015T963C]')

    expect(result.path).to.equal('C:\\Books/Author/Series/Book 2 - Title - Subtitle {Narrator Name} [B0015T963C]')
    expect(result.relPath).to.equal('Author/Series/Book 2 - Title - Subtitle {Narrator Name} [B0015T963C]')
    expect(result.mediaMetadata).to.deep.equal({
      title: 'Title',
      subtitle: 'Subtitle',
      asin: 'B0015T963C',
      authors: ['Author'],
      narrators: ['Narrator Name'],
      seriesName: 'Series',
      seriesSequence: '2',
      publishedYear: null
    })
  })

  it('should create LibraryFile data from discovered paths', async () => {
    const fs = require('fs/promises')
    const os = require('os')
    const tempDir = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-scandir-'))
    try {
      await fs.writeFile(Path.join(tempDir, 'chapter 1.mp3'), 'audio')

      const [libraryFile] = await scanUtils.buildLibraryFile(tempDir, ['chapter 1.mp3'])

      expect(libraryFile.metadata.filename).to.equal('chapter 1.mp3')
      expect(libraryFile.metadata.ext).to.equal('.mp3')
      expect(libraryFile.metadata.relPath).to.equal('chapter 1.mp3')
      expect(libraryFile.metadata.size).to.equal(5)
      expect(libraryFile.ino).to.be.a('string')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
