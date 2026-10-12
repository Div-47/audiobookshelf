const chai = require('chai')
const expect = chai.expect
const BookScanner = require('../../../server/scanner/BookScanner')

describe('BookScanner', () => {
  it('uses typed AudioFileScanner metadata mapping within the configured precedence', async () => {
    const logs = []
    const scanData = {
      mediaMetadata: { title: 'Filename Title' },
      imageLibraryFiles: [],
      setBookMetadataFromFilenames(metadata) {
        metadata.subtitle = 'From folder'
      }
    }
    const audioFiles = [
      {
        ino: 'audio-ino',
        duration: 12,
        chapters: [],
        metadata: { filename: 'track.mp3', path: '/library/book/track.mp3' },
        metaTags: {
          tagAlbum: 'Tagged Title',
          tagArtist: 'Ada Lovelace',
          tagComposer: 'Narrator One'
        }
      }
    ]

    const originalServerSettings = global.ServerSettings
    global.ServerSettings = { sortingPrefixes: [] }
    let metadata
    try {
      metadata = await BookScanner.getBookMetadataFromScanData(
        audioFiles,
        null,
        scanData,
        { addLog: (level, message) => logs.push({ level, message }) },
        { metadataPrecedence: ['folderStructure', 'audioMetatags'] }
      )
    } finally {
      global.ServerSettings = originalServerSettings
    }

    expect(metadata).to.include({
      title: 'Tagged Title',
      subtitle: 'From folder',
      titleIgnorePrefix: 'Tagged Title'
    })
    expect(metadata.authors).to.deep.equal(['Ada Lovelace'])
    expect(metadata.narrators).to.deep.equal(['Narrator One'])
    expect(logs.some((entry) => entry.message.includes('Getting metadata with precedence'))).to.equal(true)
  })

  it('ignores a new item when no valid audio or ebook files are available', async () => {
    const logs = []
    const result = await BookScanner.scanNewBookLibraryItem(
      {
        mediaType: 'book',
        relPath: 'Empty Book',
        audioLibraryFiles: [],
        ebookLibraryFiles: []
      },
      { audiobooksOnly: false },
      { addLog: (level, message) => logs.push({ level, message }) }
    )

    expect(result).to.equal(null)
    expect(logs.some((entry) => entry.message.includes('has no audio files and no ebook file'))).to.equal(true)
  })
})
