const { rateLimit, RateLimitRequestHandler } = require('express-rate-limit')
const Logger = require('../Logger')
const requestIp = require('../libs/requestIp')

interface RateLimitRequest {
  ip?: string
  path: string
  method: string
  get(header: string): string | undefined
}
interface RateLimitResponse {
  status(code: number): this
  json(value: unknown): this
}
type RateLimitHandler = (req: RateLimitRequest, res: RateLimitResponse, next: () => void) => unknown
interface RateLimitOptions {
  windowMs: number
  max: number
  standardHeaders: boolean
  legacyHeaders: boolean
  keyGenerator(req: RateLimitRequest): string
  handler(req: RateLimitRequest, res: RateLimitResponse): void
}
const createRateLimit = rateLimit as (options: RateLimitOptions) => RateLimitHandler

/**
 * Factory for creating authentication rate limiters
 */
class RateLimiterFactory {
  static DEFAULT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
  static DEFAULT_MAX = 40 // 40 attempts

  authRateLimiter: RateLimitHandler | null

  constructor() {
    this.authRateLimiter = null
  }

  /**
   * Get the authentication rate limiter
   * @returns {RateLimitRequestHandler}
   */
  getAuthRateLimiter() {
    if (this.authRateLimiter) {
      return this.authRateLimiter
    }

    // Disable by setting max to 0
    if (process.env.RATE_LIMIT_AUTH_MAX === '0') {
      this.authRateLimiter = (req, res, next) => next()
      Logger.info(`[RateLimiterFactory] Authentication rate limiting disabled by ENV variable`)
      return this.authRateLimiter
    }

    let windowMs = RateLimiterFactory.DEFAULT_WINDOW_MS
    if (parseInt(process.env.RATE_LIMIT_AUTH_WINDOW || '') > 0) {
      windowMs = parseInt(process.env.RATE_LIMIT_AUTH_WINDOW || '')
      if (windowMs !== RateLimiterFactory.DEFAULT_WINDOW_MS) {
        Logger.info(`[RateLimiterFactory] Authentication rate limiting window set to ${windowMs}ms by ENV variable`)
      }
    }

    let max = RateLimiterFactory.DEFAULT_MAX
    if (parseInt(process.env.RATE_LIMIT_AUTH_MAX || '') > 0) {
      max = parseInt(process.env.RATE_LIMIT_AUTH_MAX || '')
      if (max !== RateLimiterFactory.DEFAULT_MAX) {
        Logger.info(`[RateLimiterFactory] Authentication rate limiting max set to ${max} by ENV variable`)
      }
    }

    let message = 'Too many authentication requests'
    if (process.env.RATE_LIMIT_AUTH_MESSAGE) {
      message = process.env.RATE_LIMIT_AUTH_MESSAGE
    }

      this.authRateLimiter = createRateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: RateLimitRequest) => {
        // Override keyGenerator to handle proxy IPs
        return requestIp.getClientIp(req) || req.ip
      },
      handler: (req: RateLimitRequest, res: RateLimitResponse) => {
        const userAgent = req.get('User-Agent') || 'Unknown'
        const endpoint = req.path
        const method = req.method
        const ip = requestIp.getClientIp(req) || req.ip

        Logger.warn(`[RateLimiter] Rate limit exceeded - IP: ${ip}, Endpoint: ${method} ${endpoint}, User-Agent: ${userAgent}`)

        res.status(429).json({
          error: message
        })
      }
    })

    Logger.debug(`[RateLimiterFactory] Created auth rate limiter: ${max} attempts per ${windowMs / 1000 / 60} minutes`)

    return this.authRateLimiter
  }
}

module.exports = new RateLimiterFactory()
export {}
