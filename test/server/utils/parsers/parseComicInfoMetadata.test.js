const chai = require('chai')
const expect = chai.expect
const { parse } = require('../../../../server/utils/parsers/parseComicInfoMetadata')

describe('parseComicInfoMetadata', () => {
  it('maps ComicInfo series, issue number, and summary into book metadata', () => {
    const metadata = parse({
      ComicInfo: {
        Series: ['The Example Series'],
        Number: ['4'],
        Summary: ['A short summary.']
      }
    })

    expect(metadata).to.deep.equal({
      title: 'The Example Series 4',
      series: [{ name: 'The Example Series', sequence: '4' }],
      description: 'A short summary.'
    })
  })

  it('returns null when ComicInfo XML has no ComicInfo root', () => {
    expect(parse({})).to.equal(null)
  })
})
