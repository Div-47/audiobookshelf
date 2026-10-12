//
// This takes a string and parsed out first and last names
//   accepts comma separated lists e.g. "Jon Smith, Jane Smith" or "Smith, Jon, Smith, Jane"
//   can be separated by "&" e.g. "Jon Smith & Jane Smith" or "Smith, Jon & Smith, Jane"
//
const parseFullName = require('./parseFullName')

interface FullNameParts { first: string; middle: string; last: string }
interface ParsedName { first_name: string; last_name: string }
interface ParsedNames { names: string[] }
const parseFullNameTyped = parseFullName as (name: string) => FullNameParts

function parseName(name: string): ParsedName {
  var parts = parseFullNameTyped(name)
  var firstName = parts.first
  if (firstName && parts.middle) firstName += ' ' + parts.middle

  return {
    first_name: firstName,
    last_name: parts.last
  }
}

// Check if this name segment is of the format "Last, First" or "First Last"
// return true is "Last, First"
function checkIsALastName(name: string): boolean {
  if (!name.includes(' ')) return true // No spaces must be a Last name

  var parsed = parseFullNameTyped(name)
  if (!parsed.first) return true // had spaces but not a first name i.e. "von Mises", must be last name only

  return false
}

// Handle name already in First Last format and return Last, First
function nameToLastFirst(firstLast: string): string {
  var nameObj = parseName(firstLast)
  if (!nameObj.last_name) return nameObj.first_name
  else if (!nameObj.first_name) return nameObj.last_name
  return `${nameObj.last_name}, ${nameObj.first_name}`
}

/**
 * Parses a name string into an array of names
 *
 * @param {string} nameString - The name string to parse
 * @returns {{ names: string[] }} Array of names
 */
function parse(nameString: string | null | undefined): ParsedNames | null {
  if (!nameString) return null

  let splitNames: string[] = []
  const isCommaSeparated = nameString.includes(',')

  // Example &LF: Friedman, Milton & Friedman, Rose
  if (nameString.includes('&')) {
    nameString.split('&').forEach((asa) => (splitNames = splitNames.concat(asa.split(','))))
  } else if (nameString.includes(' and ')) {
    nameString.split(' and ').forEach((asa) => (splitNames = splitNames.concat(asa.split(','))))
  } else if (nameString.includes(';')) {
    nameString.split(';').forEach((asa) => (splitNames = splitNames.concat(asa.split(','))))
  } else {
    splitNames = nameString.split(',')
  }
  if (splitNames.length) splitNames = splitNames.map((a) => a.trim())

  // If names are in Chinese，Japanese and Korean languages, return as is.
  if (/[\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff]/.test(splitNames[0])) {
    return {
      names: splitNames
    }
  }

  let names: ParsedName[] = []

  // 1 name FIRST LAST
  if (splitNames.length === 1) {
    names.push(parseName(nameString))
  } else {
    // Determines whether this is formatted as last, first or first last (only if using comma separator)
    // Example: "Smith; James Jones" -> ["Smith", "James Jones"]
    let firstChunkIsALastName = !isCommaSeparated ? false : checkIsALastName(splitNames[0])
    let isEvenNum = splitNames.length % 2 === 0

    if (!isEvenNum && firstChunkIsALastName) {
      splitNames = splitNames.slice(0, splitNames.length - 1)
    }

    if (firstChunkIsALastName) {
      var num = splitNames.length / 2
      for (let i = 0; i < num; i++) {
        var last = splitNames.shift()
        var first = splitNames.shift()
        names.push({
          first_name: first as string,
          last_name: last as string
        })
      }
    } else {
      splitNames.forEach((segment) => {
        names.push(parseName(segment))
      })
    }
  }

  // Filter out names that have no first and last
  names = names.filter((n) => n.first_name || n.last_name)

  // Set name strings and remove duplicates
  const namesArray = [...new Set(names.map((a) => (a.first_name ? `${a.first_name} ${a.last_name}` : a.last_name)))]

  return {
    names: namesArray // Array of first last
  }
}

const parseNameString = { parse, nameToLastFirst }
export = parseNameString
