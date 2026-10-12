const { expect } = require('chai')
const sinon = require('sinon')
const StreamZip = require('../../../../server/libs/nodeStreamZip')
const extractorModule = require('../../../../server/utils/comicBookExtractors')

const zipArchive = {
  entryData: sinon.stub(),
  extract: sinon.stub(),
  close: sinon.stub().resolves()
}
StreamZip.async = class { constructor() { return zipArchive } }
const epubParser = require('../../../../server/utils/parsers/parseEpubMetadata')

const comicArchive = {
  open: sinon.stub().resolves(),
  getFilePaths: sinon.stub(),
  extractToFile: sinon.stub().resolves(true),
  extractToBuffer: sinon.stub(),
  close: sinon.stub()
}
const createComicBookExtractor = sinon.stub(extractorModule, 'createComicBookExtractor').returns(comicArchive)
const comicParserPath = require.resolve('../../../../server/utils/parsers/parseComicMetadata')
delete require.cache[comicParserPath]
const comicParser = require('../../../../server/utils/parsers/parseComicMetadata')

describe('archive metadata parser boundaries', () => {
  after(() => createComicBookExtractor.restore())

  beforeEach(() => {
    zipArchive.entryData.reset()
    zipArchive.extract.reset()
    zipArchive.close.reset()
    zipArchive.close.resolves()
    comicArchive.open.reset()
    comicArchive.open.resolves()
    comicArchive.getFilePaths.reset()
    comicArchive.extractToFile.reset()
    comicArchive.extractToFile.resolves(true)
    comicArchive.extractToBuffer.reset()
    comicArchive.close.reset()
    createComicBookExtractor.resetHistory()
  })

  it('reads EPUB container/package metadata and selects the manifest cover image', async () => {
    zipArchive.entryData.onFirstCall().resolves(Buffer.from('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'))
    zipArchive.entryData.onSecondCall().resolves(Buffer.from('<package><metadata><dc:title>Title</dc:title><meta name="cover" content="cover-id"/></metadata><manifest><item id="cover-id" href="images/front.jpg" media-type="image/jpeg"/></manifest></package>'))

    const result = await epubParser.parse({ metadata: { path: '/books/book.epub' } })

    expect(result.path).to.equal('/books/book.epub')
    expect(result.ebookFormat).to.equal('epub')
    expect(result.metadata.title).to.equal('Title')
    expect(result.ebookCoverPath).to.equal('OPS/images/front.jpg')
    expect(zipArchive.close.callCount).to.equal(2)
  })

  it('returns null for an EPUB without a package document path', async () => {
    zipArchive.entryData.resolves(Buffer.from('<container><rootfiles/></container>'))
    expect(await epubParser.parse({ metadata: { path: '/books/empty.epub' } })).to.equal(null)
  })

  it('reads comic info and chooses the naturally first supported image', async () => {
    comicArchive.getFilePaths.resolves(['page10.jpg', 'page2.jpg', 'ComicInfo.xml'])
    comicArchive.extractToBuffer.resolves(Buffer.from('<ComicInfo><Series>Series</Series><Number>2</Number><Summary>Summary</Summary></ComicInfo>'))

    const result = await comicParser.parse({ ebookFormat: 'cbz', metadata: { path: '/books/book.cbz' } })

    expect(result.metadata).to.deep.equal({ title: 'Series 2', series: [{ name: 'Series', sequence: '2' }], description: 'Summary' })
    expect(result.ebookCoverPath).to.equal('page2.jpg')
    expect(comicArchive.close.calledOnce).to.equal(true)
  })
})
