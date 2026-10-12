const { expect } = require('chai')
const abmetadataGenerator = require('../../../server/utils/generators/abmetadataGenerator')
const opmlGenerator = require('../../../server/utils/generators/opmlGenerator')

describe('metadata and OPML generators', () => {
  it('normalizes legacy metadata, validates values, and cleans chapters', () => {
    const result = abmetadataGenerator.parseJson(JSON.stringify({
      metadata: { feedUrl: 'https://example.test/rss', title: 42 },
      chapters: [{ start: 0, end: 15, title: 'Opening' }]
    }), 'book')

    expect(result).to.deep.equal({
      title: '42',
      chapters: [{ id: 0, start: 0, end: 15, title: 'Opening' }]
    })
    expect(abmetadataGenerator.parseJson('{ invalid', 'book')).to.equal(null)
  })

  it('generates OPML outlines for valid podcast feeds and omits missing feed URLs', () => {
    const output = opmlGenerator.generate([
      { title: 'Show & Tell', feedURL: 'https://example.test/feed.xml', description: 'News', language: 'en' },
      { title: 'No Feed', feedURL: null }
    ])

    expect(output).to.include('<?xml version="1.0" encoding="UTF-8"?>')
    expect(output).to.include('https://example.test/feed.xml')
    expect(output).to.include('Show &amp;amp; Tell')
    expect(output).not.to.include('No Feed')
  })
})
