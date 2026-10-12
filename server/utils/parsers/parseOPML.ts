const h = require('htmlparser2')
const Logger = require('../../Logger')

interface PodcastFeedReference { title: string; feedUrl: string }
interface OpmlParserHandlerOptions { onopentag(name: string, attributes: Record<string, string>): void }
interface OpmlParser { write(text: string): void }
interface HtmlParserModule { Parser: new (options: OpmlParserHandlerOptions) => OpmlParser }
const htmlParser = h as HtmlParserModule

/**
 *
 * @param {string} opmlText
 * @returns {Array<{title: string, feedUrl: string}>
 */
function parse(opmlText: string): PodcastFeedReference[] {
  const feeds: PodcastFeedReference[] = []
  var parser = new htmlParser.Parser({
    onopentag: (name, attribs) => {
      if (name === 'outline' && attribs.type === 'rss') {
        if (!attribs.xmlurl) {
          Logger.error('[parseOPML] Invalid opml outline tag has no xmlurl attribute')
        } else {
          feeds.push({
            title: attribs.title || attribs.text || '',
            feedUrl: attribs.xmlurl
          })
        }
      }
    }
  })
  parser.write(opmlText)
  return feeds
}
const parseOPML = { parse }
export = parseOPML
