const chai = require('chai')
const expect = chai.expect
const fs = require('fs/promises')
const os = require('os')
const Path = require('path')
const AbsMetadataFileScanner = require('../../../server/scanner/AbsMetadataFileScanner')

describe('AbsMetadataFileScanner', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-metadata-scanner-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('applies validated book metadata while preserving existing values for empty arrays', async () => {
    const metadataPath = Path.join(tempDir, 'metadata.json')
    await fs.writeFile(metadataPath, JSON.stringify({
      title: 'Override Title',
      authors: [],
      tags: ['New Tag'],
      chapters: [{ start: 0, end: 15, title: 'Opening' }]
    }))
    const bookMetadata = {
      title: 'Original Title',
      authors: ['Existing Author'],
      tags: ['Old Tag'],
      chapters: [{ id: 0, start: 0, end: 10, title: 'Old Chapter' }]
    }

    await AbsMetadataFileScanner.scanBookMetadataFile(
      { addLog() {} },
      { metadataJsonLibraryFile: { metadata: { path: metadataPath } } },
      bookMetadata
    )

    expect(bookMetadata).to.deep.equal({
      title: 'Override Title',
      authors: ['Existing Author'],
      tags: ['New Tag'],
      chapters: [{ id: 0, start: 0, end: 15, title: 'Opening' }]
    })
  })

  it('loads podcast overrides from the metadata items fallback path', async () => {
    const originalMetadataPath = global.MetadataPath
    global.MetadataPath = tempDir
    try {
      const itemMetadataDir = Path.join(tempDir, 'items', 'podcast-item-1')
      await fs.mkdir(itemMetadataDir, { recursive: true })
      await fs.writeFile(Path.join(itemMetadataDir, 'metadata.json'), JSON.stringify({
        metadata: {
          feedUrl: 'https://example.com/feed.xml',
          type: 'serial',
          author: null
        },
        tags: [],
        genres: []
      }))
      const podcastMetadata = {
        title: 'Podcast',
        feedURL: null,
        podcastType: null,
        author: 'Existing Author',
        tags: ['Keep This Tag'],
        genres: ['Existing Genre']
      }

      await AbsMetadataFileScanner.scanPodcastMetadataFile(
        { addLog() {} },
        {},
        podcastMetadata,
        'podcast-item-1'
      )

      expect(podcastMetadata).to.deep.equal({
        title: 'Podcast',
        feedURL: 'https://example.com/feed.xml',
        podcastType: 'serial',
        author: 'Existing Author',
        tags: ['Keep This Tag'],
        genres: []
      })
    } finally {
      global.MetadataPath = originalMetadataPath
    }
  })

  it('ignores invalid JSON without changing the metadata target', async () => {
    const metadataPath = Path.join(tempDir, 'metadata.json')
    await fs.writeFile(metadataPath, '{invalid json')
    const podcastMetadata = { title: 'Unchanged', tags: [] }

    await AbsMetadataFileScanner.scanPodcastMetadataFile(
      { addLog() {} },
      { metadataJsonLibraryFile: { metadata: { path: metadataPath } } },
      podcastMetadata
    )

    expect(podcastMetadata).to.deep.equal({ title: 'Unchanged', tags: [] })
  })
})
