const { xmlToJSON } = require('../index') as { xmlToJSON(xml: string): Promise<unknown> }
const htmlSanitizer = require('../htmlSanitizer') as { stripAllTags(value: string): string }

type Attributes = Record<string, string | undefined>
interface XmlElement {
  $?: Attributes
  _?: string
  [key: string]: unknown
}
interface OpfMetadataNode extends XmlElement {
  'dc:creator'?: unknown[]
  'dc:identifier'?: unknown[]
  'dc:title'?: unknown[]
  'dc:subtitle'?: unknown[]
  'dc:date'?: unknown[]
  'dc:publisher'?: unknown[]
  'dc:description'?: unknown[]
  'dc:subject'?: unknown[]
  'dc:language'?: unknown[]
  'dc:tag'?: unknown[]
  meta?: { refines?: Array<{ value?: string; refines?: string; property?: string }>; [key: string]: unknown }
}
interface ParsedOpfMetadata {
  title: string | null
  subtitle: string | null
  authors: string[]
  narrators: string[]
  publishedYear: string | null
  publisher: string | null
  isbn: string | null
  asin: string | null
  description: string | null
  genres: string[]
  language: string | null
  series: Array<{ name: string; sequence: string | null }>
  tags: string[]
}

const asElement = (value: unknown): XmlElement | null => value && typeof value === 'object' && !Array.isArray(value) ? value as XmlElement : null
const asMetadata = (value: unknown): OpfMetadataNode | null => asElement(value) as OpfMetadataNode | null
const asArray = (value: unknown): unknown[] | null => Array.isArray(value) ? value : null
const text = (value: unknown): string | null => typeof value === 'string' ? value : null

function parseCreators(metadata: OpfMetadataNode): Array<{ value: string; role: string | null; fileAs: string | null } | false> | null {
  const creators = asArray(metadata['dc:creator'])
  if (!creators?.length) return null
  return creators.map((value) => {
    const element = asElement(value)
    if (!element?.$ || !element._) return false
    const namespace = Object.keys(element.$).find((key) => key.startsWith('xmlns:'))?.split(':')[1] || 'opf'
    const creator = { value: element._, role: element.$[`${namespace}:role`] || null, fileAs: element.$[`${namespace}:file-as`] || null }
    const id = element.$.id
    const refines = metadata.meta?.refines
    if (id && refines?.some((refine) => refine.refines === `#${id}`)) {
      const creatorMeta = refines.filter((refine) => refine.refines === `#${id}`)
      if (creatorMeta) {
        creator.role = creatorMeta.find((entry) => entry.property === 'role')?.value || creator.role || null
        creator.fileAs = creatorMeta.find((entry) => entry.property === 'file-as')?.value || creator.fileAs || null
      }
    }
    return creator
  })
}

function fetchCreators(creators: ReturnType<typeof parseCreators>, role: string): string[] | null {
  if (!creators?.length) return null
  return [...new Set(creators.filter((creator): creator is Exclude<typeof creator, false> => !!creator && creator.role === role && !!creator.value).map((creator) => creator.value))]
}
function fetchTagString(metadata: OpfMetadataNode, tag: string): string | null {
  const values = asArray(metadata[tag])
  if (!values?.length) return null
  let value: unknown = values[0]
  if (value && typeof value === 'object') value = asElement(value)?._
  return text(value)
}
function fetchDate(metadata: OpfMetadataNode): string | null {
  const date = fetchTagString(metadata, 'dc:date')
  if (!date) return null
  const year = date.split('-')[0]
  return year.length === 4 && !isNaN(Number(year)) ? year : null
}
function fetchIdentifier(metadata: OpfMetadataNode, scheme: string): string | null {
  const identifiers = asArray(metadata['dc:identifier'])
  if (!identifiers?.length) return null
  const identifier = identifiers.map(asElement).find((item) => {
    if (!item?.$) return false
    const namespace = Object.keys(item.$).find((key) => key.startsWith('xmlns:'))?.split(':')[1] || 'opf'
    return item.$[`${namespace}:scheme`] === scheme
  })
  return identifier?._ || null
}
function fetchSeries(metadataMeta: unknown): ParsedOpfMetadata['series'] {
  const entries = asArray(metadataMeta)
  if (!entries) return []
  const result: ParsedOpfMetadata['series'] = []
  for (let i = 0; i < entries.length; i++) {
    const attrs = asElement(entries[i])?.$
    if (attrs?.name === 'calibre:series' && attrs.content?.trim()) {
      let sequence: string | null = null
      const next = asElement(entries[i + 1])?.$
      if (next?.name === 'calibre:series_index' && next.content?.trim()) sequence = next.content.trim()
      result.push({ name: attrs.content.trim(), sequence })
    }
  }
  if (result.length === 1 && !result[0].sequence) {
    const seriesIndex = entries.map((entry) => asElement(entry)?.$).find((attrs) => attrs?.name === 'calibre:series_index' && attrs.content?.trim())
    if (seriesIndex?.content) result[0].sequence = seriesIndex.content.trim()
  }
  return result.filter((series, index) => result.findIndex((entry) => entry.name === series.name) === index)
}
function fetchNarrators(creators: ReturnType<typeof parseCreators>, metadata: OpfMetadataNode): string[] | null {
  const narrators = fetchCreators(creators, 'nrt')
  if (narrators?.length) return narrators
  try {
    const raw = fetchTagString(metadata.meta as OpfMetadataNode, 'calibre:user_metadata:#narrators')
    const json = JSON.parse((raw as string).replace(/&quot;/g, '"')) as { '#value#': string[] }
    return json['#value#']
  } catch { return null }
}
function fetchStringList(metadata: OpfMetadataNode, tag: string): string[] {
  const values = asArray(metadata[tag]) || []
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && !!value))]
}
function stripPrefix(value: string): string { return value.split(':').pop() || '' }

function parseOpfMetadataJson(json: Record<string, unknown>): ParsedOpfMetadata | null {
  const packageKey = Object.keys(json).find((key) => stripPrefix(key) === 'package')
  if (!packageKey) return null
  const packageNode = asElement(json[packageKey])
  if (!packageNode) return null
  const prefix = packageKey.split(':').shift()
  let metadata: unknown = prefix ? packageNode[`${prefix}:metadata`] || packageNode.metadata : packageNode.metadata
  if (!metadata) return null
  if (Array.isArray(metadata)) {
    if (!metadata.length) return null
    metadata = metadata[0]
  }
  const metadataNode = asMetadata(metadata)
  if (!metadataNode) return null
  const metadataMeta = prefix ? metadataNode[`${prefix}:meta`] || metadataNode.meta : metadataNode.meta
  const normalizedMeta: NonNullable<OpfMetadataNode['meta']> = {}
  const refines: NonNullable<NonNullable<OpfMetadataNode['meta']>['refines']> = []
  const metaArray = asArray(metadataMeta)
  metaArray?.forEach((value) => {
    const meta = asElement(value)
    if (meta?.$?.name) normalizedMeta[meta.$.name] = [meta.$.content || '']
    else if (meta?.$?.refines) refines.push({ value: meta._, refines: meta.$.refines, property: meta.$.property })
  })
  if (refines.length) normalizedMeta.refines = refines
  metadataNode.meta = normalizedMeta
  const creators = parseCreators(metadataNode)
  const authors = (fetchCreators(creators, 'aut') || []).map((author) => author.trim()).filter(Boolean)
  const narrators = (fetchNarrators(creators, metadataNode) || []).map((narrator) => narrator?.trim()).filter(Boolean)
  return {
    title: fetchTagString(metadataNode, 'dc:title'),
    subtitle: fetchTagString(metadataNode, 'dc:subtitle'),
    authors, narrators,
    publishedYear: fetchDate(metadataNode),
    publisher: fetchTagString(metadataNode, 'dc:publisher'),
    isbn: fetchIdentifier(metadataNode, 'ISBN'),
    asin: fetchIdentifier(metadataNode, 'ASIN'),
    description: (() => { const value = fetchTagString(metadataNode, 'dc:description'); return value ? htmlSanitizer.stripAllTags(value.replace(/&lt;/g, '<').replace(/&gt;/g, '>')) : null })(),
    genres: fetchStringList(metadataNode, 'dc:subject'),
    language: fetchTagString(metadataNode, 'dc:language'),
    series: fetchSeries(metaArray),
    tags: fetchStringList(metadataNode, 'dc:tag')
  }
}
async function parseOpfMetadataXML(xml: string): Promise<ParsedOpfMetadata | null> {
  const json = await xmlToJSON(xml)
  return json && typeof json === 'object' ? parseOpfMetadataJson(json as Record<string, unknown>) : null
}

const parseOpfMetadata = { parseOpfMetadataJson, parseOpfMetadataXML }
export = parseOpfMetadata
