const { expect } = require('chai')
const parseSeriesString = require('../../../../server/utils/parsers/parseSeriesString')

describe('parseSeriesString', () => {
  it('parses a trailing series sequence', () => {
    expect(parseSeriesString.parse('Name #1a')).to.deep.equal({ name: 'Name', sequence: '1a' })
  })

  it('preserves strings that do not match the sequence format', () => {
    expect(parseSeriesString.parse('Name #1 a')).to.deep.equal({ name: 'Name #1 a', sequence: null })
    expect(parseSeriesString.parse('Name #1#a')).to.deep.equal({ name: 'Name #1#a', sequence: null })
  })

  it('returns null for missing or non-string values', () => {
    expect(parseSeriesString.parse('')).to.equal(null)
    expect(parseSeriesString.parse(null)).to.equal(null)
  })
})
