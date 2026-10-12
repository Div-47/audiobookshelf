const chai = require('chai')
const expect = chai.expect
const parseEbookMetadata = require('../../../../server/utils/parsers/parseEbookMetadata')

describe('parseEbookMetadata', () => {
  it('returns null for missing ebooks and unsupported ebook formats', async () => {
    expect(await parseEbookMetadata.parse(null)).to.equal(null)
    expect(await parseEbookMetadata.parse({ ebookFormat: 'pdf', metadata: { path: '/book/book.pdf' } })).to.equal(null)
  })

  it('returns false when there is no embedded cover to extract', async () => {
    expect(await parseEbookMetadata.extractCoverImage({ path: '/book/book.epub', ebookFormat: 'epub' }, '/covers/cover.jpg')).to.equal(false)
  })
})
