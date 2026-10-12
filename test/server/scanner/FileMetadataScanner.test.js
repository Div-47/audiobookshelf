const chai = require('chai')
const expect = chai.expect
const fs = require('fs/promises')
const os = require('os')
const Path = require('path')
const NfoFileScanner = require('../../../server/scanner/NfoFileScanner')
const OpfFileScanner = require('../../../server/scanner/OpfFileScanner')

describe('file metadata scanners', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-file-metadata-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('applies NFO fields and retains existing values when parsed collections are empty', async () => {
    const nfoPath = Path.join(tempDir, 'book.nfo')
    await fs.writeFile(nfoPath, 'Title: NFO Title\nAuthor: One Author, Two Author\nGenre: Fiction, Mystery\nSeries Name: NFO Series\nPosition in Series: 2')
    const metadata = {
      title: 'Original Title',
      tags: ['Existing Tag'],
      genres: ['Existing Genre'],
      authors: ['Existing Author'],
      narrators: [],
      series: []
    }

    await NfoFileScanner.scanBookNfoFile({ metadata: { path: nfoPath } }, metadata)

    expect(metadata).to.include({ title: 'NFO Title' })
    expect(metadata.authors).to.deep.equal(['One Author', 'Two Author'])
    expect(metadata.genres).to.deep.equal(['Fiction', 'Mystery'])
    expect(metadata.series).to.deep.equal([{ name: 'NFO Series', sequence: '2' }])
    expect(metadata.tags).to.deep.equal(['Existing Tag'])
  })

  it('applies OPF metadata from disk while keeping empty parser collections from clearing values', async () => {
    const opfPath = Path.join(tempDir, 'book.opf')
    await fs.writeFile(opfPath, `
      <package xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <metadata>
          <dc:title>OPF Title</dc:title>
          <dc:subject>Science Fiction</dc:subject>
          <meta name="calibre:series" content="OPF Series" />
          <meta name="calibre:series_index" content="3" />
        </metadata>
      </package>
    `)
    const metadata = {
      title: 'Original Title',
      tags: ['Existing Tag'],
      genres: ['Existing Genre'],
      authors: ['Existing Author'],
      narrators: ['Existing Narrator'],
      series: []
    }

    await OpfFileScanner.scanBookOpfFile({ metadata: { path: opfPath } }, metadata)

    expect(metadata.title).to.equal('OPF Title')
    expect(metadata.genres).to.deep.equal(['Science Fiction'])
    expect(metadata.series).to.deep.equal([{ name: 'OPF Series', sequence: '3' }])
    expect(metadata.tags).to.deep.equal(['Existing Tag'])
    expect(metadata.authors).to.deep.equal(['Existing Author'])
    expect(metadata.narrators).to.deep.equal(['Existing Narrator'])
  })
})
