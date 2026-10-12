const chai = require('chai')
const expect = chai.expect
const PodcastScanner = require('../../../server/scanner/PodcastScanner')

describe('PodcastScanner', () => {
  it('maps metadata from the first episode through AudioFileScanner', async () => {
    const scanData = {
      mediaMetadata: { title: 'Folder Podcast Name' },
      metadataJsonLibraryFile: null
    }
    const logs = []
    const originalServerSettings = global.ServerSettings
    global.ServerSettings = { sortingPrefixes: [] }
    let metadata
    try {
      metadata = await PodcastScanner.getPodcastMetadataFromScanData(
        [
          {
            audioFile: {
              metaTags: {
                tagAlbum: 'Tagged Podcast Name',
                tagAlbumArtist: 'Podcast Author',
                tagGenre: 'Technology;Education'
              }
            }
          }
        ],
        scanData,
        { addLog: (level, message) => logs.push({ level, message }) }
      )
    } finally {
      global.ServerSettings = originalServerSettings
    }

    expect(metadata).to.include({
      title: 'Tagged Podcast Name',
      titleIgnorePrefix: 'Tagged Podcast Name',
      author: 'Podcast Author'
    })
    expect(metadata.genres).to.deep.equal(['Technology', 'Education'])
    expect(logs.some((entry) => entry.message.includes('tagAlbumArtist'))).to.equal(true)
  })

  it('ignores a new podcast item when no valid audio files are available', async () => {
    const logs = []
    const result = await PodcastScanner.scanNewPodcastLibraryItem(
      {
        mediaType: 'podcast',
        relPath: 'Empty Podcast',
        audioLibraryFiles: []
      },
      {},
      { addLog: (level, message) => logs.push({ level, message }) }
    )

    expect(result).to.equal(null)
    expect(logs.some((entry) => entry.message.includes('has no audio files - ignoring'))).to.equal(true)
  })
})
