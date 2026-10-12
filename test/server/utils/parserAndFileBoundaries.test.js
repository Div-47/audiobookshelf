const { expect } = require('chai')
const parseUserAgent = require('../../../server/utils/parsers/parseUserAgent')
const parseOPML = require('../../../server/utils/parsers/parseOPML')
const parseOverdriveMediaMarkers = require('../../../server/utils/parsers/parseOverdriveMediaMarkers')
const FileMetadata = require('../../../server/objects/metadata/FileMetadata')
const LibraryFile = require('../../../server/objects/files/LibraryFile')
const EBookFile = require('../../../server/objects/files/EBookFile')

describe('typed utility and file metadata boundaries', () => {
  it('extracts available browser/device fields and handles missing user agents', () => {
    expect(parseUserAgent(null)).to.equal(null)
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36')).to.include({
      browserName: 'Chrome',
      osName: 'Windows'
    })
  })

  it('reads RSS outlines and skips entries without a feed URL', () => {
    const feeds = parseOPML.parse('<opml><body><outline type="rss" title="Show" xmlurl="https://example.test/feed.xml"/><outline type="rss" text="Missing"/></body></opml>')
    expect(feeds).to.deep.equal([{ title: 'Show', feedUrl: 'https://example.test/feed.xml' }])
  })

  it('converts OverDrive marker times to chapter offsets and ends', () => {
    const marker = '<Markers><Marker><Name>Opening</Name><Time>0:00.000</Time></Marker><Marker><Name>Chapter 1</Name><Time>0:05.000</Time></Marker></Markers>'
    expect(parseOverdriveMediaMarkers.parseOverdriveMediaMarkersAsChapters([
      { duration: 10, metaTags: { tagOverdriveMediaMarker: marker } }
    ])).to.deep.equal([
      { id: 0, start: 0, title: 'Opening', end: 5 },
      { id: 1, start: 5, title: 'Chapter 1', end: 10 }
    ])
    expect(parseOverdriveMediaMarkers.parseOverdriveMediaMarkersAsChapters([{ duration: 1 }])).to.equal(null)
  })

  it('preserves file metadata serialization, cloning, and supported updates', () => {
    const metadata = new FileMetadata({ filename: 'book.mp3', ext: '.mp3', path: '/audio/book.mp3', size: 12 })
    metadata.wasModified = true
    expect(metadata.format).to.equal('mp3')
    expect(metadata.filenameNoExt).to.equal('book')
    expect(metadata.update({ size: 14, unknownValue: 'ignored' })).to.equal(true)
    expect(metadata.clone().toJSON()).to.deep.equal(metadata.toJSON())
    expect(metadata.toJSON()).not.to.have.property('wasModified')
  })

  it('classifies and clones library files, then updates ebook data from the file', () => {
    const libraryFile = new LibraryFile({
      ino: '123',
      metadata: { filename: 'story.epub', ext: '.epub', path: '/books/story.epub', relPath: 'story.epub', size: 50 }
    })
    expect(libraryFile.fileType).to.equal('ebook')
    expect(libraryFile.isEBookFile).to.equal(true)
    expect(libraryFile.clone().toJSON()).to.deep.equal(libraryFile.toJSON())

    const ebookFile = new EBookFile()
    ebookFile.setData(libraryFile)
    expect(ebookFile.isEpub).to.equal(true)
    expect(ebookFile.toJSON().metadata.path).to.equal('/books/story.epub')
    const changedFile = new LibraryFile({ ino: '123', metadata: { ...libraryFile.metadata.toJSON(), ext: '.pdf' } })
    expect(ebookFile.updateFromLibraryFile(changedFile)).to.equal(true)
    expect(ebookFile.ebookFormat).to.equal('pdf')
  })
})
