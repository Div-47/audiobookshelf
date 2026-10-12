
interface ComicInfoDocument {
  ComicInfo?: {
    Series?: string[]
    Number?: string[]
    Summary?: string[]
  }
}
interface ComicSeries {
  name: string
  sequence: string | null
}
interface ComicInfoMetadata {
  title: string | null
  series: ComicSeries[]
  description: string | null
}

/**
 * TODO: Add more fields
 * @see https://anansi-project.github.io/docs/comicinfo/intro
 * 
 * @param {Object} comicInfoJson 
 * @returns {import('../../scanner/BookScanner').BookMetadataObject}
 */
function parse(comicInfoJson: ComicInfoDocument | null | undefined): ComicInfoMetadata | null {
  if (!comicInfoJson?.ComicInfo) return null

  const ComicSeries = comicInfoJson.ComicInfo.Series?.[0]?.trim() || null
  const ComicNumber = comicInfoJson.ComicInfo.Number?.[0]?.trim() || null
  const ComicSummary = comicInfoJson.ComicInfo.Summary?.[0]?.trim() || null

  let title = null
  const series: ComicSeries[] = []
  if (ComicSeries) {
    series.push({
      name: ComicSeries,
      sequence: ComicNumber
    })

    title = ComicSeries
    if (ComicNumber) {
      title += ` ${ComicNumber}`
    }
  }

  return {
    title,
    series,
    description: ComicSummary
  }
}

export = { parse }
