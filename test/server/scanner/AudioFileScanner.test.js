const chai = require('chai')
const expect = chai.expect
const AudioFileScanner = require('../../../server/scanner/AudioFileScanner')

describe('AudioFileScanner', () => {
  it('uses sequential disc metadata and the most complete track numbering when ordering', () => {
    const audioFiles = [
      { index: null, discNumFromMeta: 2, discNumFromFilename: null, trackNumFromMeta: 1, trackNumFromFilename: 2 },
      { index: null, discNumFromMeta: 1, discNumFromFilename: null, trackNumFromMeta: 2, trackNumFromFilename: 1 },
      { index: null, discNumFromMeta: 1, discNumFromFilename: null, trackNumFromMeta: 1, trackNumFromFilename: 3 }
    ]

    const ordered = AudioFileScanner.runSmartTrackOrder('Author/Book', audioFiles)

    expect(ordered.map((file) => [file.discNumFromMeta, file.trackNumFromFilename])).to.deep.equal([[1, 1], [1, 3], [2, 2]])
    expect(ordered.map((file) => file.index)).to.deep.equal([1, 2, 3])
  })

  it('extracts track and disc numbers from filenames and CD folders', () => {
    const libraryFile = {
      metadata: { filename: 'Book - Disc 2 Track 07.mp3', path: '/books/Book/CD03/Book - Disc 2 Track 07.mp3' }
    }

    expect(AudioFileScanner.getTrackAndDiscNumberFromFilename({}, libraryFile)).to.deep.equal({ trackNumber: 7, discNumber: 3 })
  })

  it('builds chapters from multiple audio files when embedded chapters are absent', () => {
    const libraryScan = { addLog() {} }
    const audioFiles = [
      { duration: 12, chapters: [], metadata: { filename: '01 - Opening.mp3' }, metaTags: { tagTitle: null } },
      { duration: 18, chapters: [], metadata: { filename: '02 - Arrival.mp3' }, metaTags: { tagTitle: null } }
    ]

    expect(AudioFileScanner.getBookChaptersFromAudioFiles('Book', audioFiles, libraryScan)).to.deep.equal([
      { id: 0, start: 0, end: 12, title: '01 - Opening' },
      { id: 1, start: 12, end: 30, title: '02 - Arrival' }
    ])
  })
})
