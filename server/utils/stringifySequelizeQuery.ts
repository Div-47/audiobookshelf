function stringifySequelizeQuery(findOptions: unknown): string | undefined {
  function isClass(func: unknown): func is Function {
    return typeof func === 'function' && /^class\s/.test(func.toString())
  }

  function replacer(_key: string, value: unknown): unknown {
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<PropertyKey, unknown>
      const symbols = Object.getOwnPropertySymbols(value).reduce<Record<string, unknown>>((acc, sym) => {
        acc[sym.toString()] = record[sym]
        return acc
      }, {})

      return { ...value, ...symbols }
    }

    if (isClass(value)) {
      return `${value.name}`
    }

    return value
  }

  return JSON.stringify(findOptions, replacer)
}

export default stringifySequelizeQuery
module.exports = stringifySequelizeQuery

