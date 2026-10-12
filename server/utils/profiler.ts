const { performance, createHistogram } = require('perf_hooks')
const util = require('util')
const Logger = require('../Logger')

type RecordedHistogram = ReturnType<typeof createHistogram> & { values: number[] }
type AsyncFunction<Args extends unknown[], Result> = (...args: Args) => Promise<Result>
const histograms = new Map<string, RecordedHistogram>()

function profile<Args extends unknown[], Result>(asyncFunc: AsyncFunction<Args, Result>, isFindQuery = true, funcName = asyncFunc.name): AsyncFunction<Args, Result> {
  if (!histograms.has(funcName)) {
    const histogram = createHistogram() as RecordedHistogram
    histogram.values = []
    histograms.set(funcName, histogram)
  }
    const histogram = histograms.get(funcName)!

  return async (...args: Args): Promise<Result> => {
    if (isFindQuery) {
      const findOptions = args[0] as Record<string, unknown>
      Logger.info(`[${funcName}] findOptions:`, util.inspect(findOptions, { depth: null }))
      findOptions.logging = (query: string, time: number) => Logger.info(`[${funcName}] ${query} Elapsed time: ${time}ms`)
      findOptions.benchmark = true
    }
    const start = performance.now()
    try {
      const result = await asyncFunc(...args)
      return result
    } catch (error) {
      Logger.error(`[${funcName}] failed`)
      throw error
    } finally {
      const end = performance.now()
      const duration = Math.round(end - start)
      histogram.record(duration)
      histogram.values.push(duration)
      Logger.info(`[${funcName}] duration: ${duration}ms`)
      Logger.info(`[${funcName}] histogram values:`, histogram.values)
      Logger.info(`[${funcName}] histogram:`, histogram)
    }
  }
}

module.exports = { profile }
export {}
