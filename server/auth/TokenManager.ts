import type { Request, Response } from '../types/express'
import type { JwtTokenPayload, TokensAndSessionResult, RotatedTokensResult, RefreshTokenResult } from '../types/Auth'

const { Op } = require('sequelize')
const uuid = require('uuid')

const Database = require('../Database')
const Logger = require('../Logger')

const requestIp = require('../libs/requestIp')
const jwt = require('../libs/jsonwebtoken')
const { isRequestSecure } = require('../utils/requestUtils')

class TokenManager {
  static TokenSecret: string | null = null
  RefreshTokenExpiry: number
  AccessTokenExpiry: number
  RefreshTokenGracePeriod: number

  constructor() {
    this.RefreshTokenExpiry = parseInt(process.env.REFRESH_TOKEN_EXPIRY || '') || 30 * 24 * 60 * 60 // 30 days
    this.AccessTokenExpiry = parseInt(process.env.ACCESS_TOKEN_EXPIRY || '') || 1 * 60 * 60 // 1 hour
    this.RefreshTokenGracePeriod = parseInt(process.env.REFRESH_TOKEN_GRACE_PERIOD || '') || 10 * 60 // 10 minutes

    if (parseInt(process.env.REFRESH_TOKEN_EXPIRY || '') > 0) {
      Logger.info(`[TokenManager] Refresh token expiry set from ENV variable to ${this.RefreshTokenExpiry} seconds`)
    }
    if (parseInt(process.env.ACCESS_TOKEN_EXPIRY || '') > 0) {
      Logger.info(`[TokenManager] Access token expiry set from ENV variable to ${this.AccessTokenExpiry} seconds`)
    }
    if (parseInt(process.env.REFRESH_TOKEN_GRACE_PERIOD || '') > 0) {
      Logger.info(`[TokenManager] Refresh token grace period set from ENV variable to ${this.RefreshTokenGracePeriod} seconds`)
    }
  }

  get TokenSecret(): string | null {
    return TokenManager.TokenSecret
  }

  /**
   * Token secret is used to sign and verify JWTs
   * Set by ENV variable "JWT_SECRET_KEY" or generated and stored on server settings if not set
   */
  async initTokenSecret(): Promise<void> {
    if (process.env.JWT_SECRET_KEY) {
      Logger.info('[TokenManager] JWT secret key set from ENV variable')
      TokenManager.TokenSecret = process.env.JWT_SECRET_KEY
    } else if (!Database.serverSettings.tokenSecret) {
      Logger.info('[TokenManager] JWT secret key not found, generating one')
      TokenManager.TokenSecret = require('crypto').randomBytes(256).toString('base64')
      Database.serverSettings.tokenSecret = TokenManager.TokenSecret
      await Database.updateServerSettings()
    } else {
      TokenManager.TokenSecret = Database.serverSettings.tokenSecret
    }
  }

  /**
   * Sets the refresh token cookie
   * @param {Request} req
   * @param {Response} res
   * @param {string} refreshToken
   */
  setRefreshTokenCookie(req: Request, res: Response, refreshToken: string): void {
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isRequestSecure(req),
      sameSite: 'lax',
      maxAge: this.RefreshTokenExpiry * 1000,
      path: '/'
    })
  }

  /**
   * Whether a decoded JWT payload may authenticate API/socket requests (not refresh-only credentials).
   *
   * @param {JwtTokenPayload} decoded
   * @returns {boolean}
   */
  static isBearerAccessTokenPayload(decoded: JwtTokenPayload | null | undefined): boolean {
    if (!decoded?.userId) return false
    if (decoded.type === 'refresh') return false
    return true
  }

  /**
   * Function to validate a jwt token for a given user
   * Used to authenticate socket connections
   *
   * @param {string} token
   * @returns {any} tokens data
   */
  static validateAccessToken(token: string): any {
    try {
      return jwt.verify(token, TokenManager.TokenSecret, { ignoreExpiration: true })
    } catch {
      return null
    }
  }

  /**
   * Generate a JWT token for a given user
   * @deprecated
   *
   * @param {{ id: string, username: string }} user
   * @returns {string}
   */
  static generateAccessToken(user: { id: string; username: string }): string {
    return jwt.sign({ userId: user.id, username: user.username }, TokenManager.TokenSecret)
  }

  /**
   * Function to generate a jwt token for a given user
   * @deprecated
   *
   * @param {{ id: string, username: string }} user
   * @returns {string}
   */
  generateAccessToken(user: { id: string; username: string }): string {
    return TokenManager.generateAccessToken(user)
  }

  /**
   * Generate access token for a given user
   *
   * @param {{ id: string, username: string }} user
   * @returns {string | null}
   */
  generateTempAccessToken(user: { id: string; username: string }): string | null {
    const payload = {
      userId: user.id,
      username: user.username,
      jti: uuid.v4(),
      type: 'access'
    }
    const options = {
      expiresIn: this.AccessTokenExpiry
    }
    try {
      return jwt.sign(payload, TokenManager.TokenSecret, options)
    } catch (error) {
      Logger.error(`[TokenManager] Error generating access token for user ${user.id}: ${error}`)
      return null
    }
  }

  /**
   * Generate refresh token for a given user
   *
   * @param {{ id: string, username: string }} user
   * @returns {string | null}
   */
  generateRefreshToken(user: { id: string; username: string }): string | null {
    const payload = {
      userId: user.id,
      username: user.username,
      jti: uuid.v4(),
      type: 'refresh'
    }
    const options = {
      expiresIn: this.RefreshTokenExpiry
    }
    try {
      return jwt.sign(payload, TokenManager.TokenSecret, options)
    } catch (error) {
      Logger.error(`[TokenManager] Error generating refresh token for user ${user.id}: ${error}`)
      return null
    }
  }

  /**
   * Create tokens and session for a given user
   *
   * @param {{ id: string, username: string }} user
   * @param {Request} req
   * @returns {Promise<TokensAndSessionResult>}
   */
  async createTokensAndSession(user: { id: string; username: string }, req: Request): Promise<TokensAndSessionResult> {
    const ipAddress = requestIp.getClientIp(req)
    const userAgent = req.headers?.['user-agent']
    const accessToken = this.generateTempAccessToken(user)
    const refreshToken = this.generateRefreshToken(user)

    const expiresAt = new Date(Date.now() + this.RefreshTokenExpiry * 1000)

    const session = await Database.sessionModel.createSession(user.id, ipAddress, userAgent, refreshToken, expiresAt)

    return {
      accessToken,
      refreshToken,
      session
    }
  }

  /**
   * Rotate tokens for a given session
   *
   * @param {any} session
   * @param {any} user
   * @param {Request} req
   * @param {Response} res
   * @param {boolean} gracePeriod - whether to use the grace period
   * @returns {Promise<RotatedTokensResult>}
   */
  async rotateTokensForSession(session: any, user: any, req: Request, res: Response, gracePeriod = true): Promise<RotatedTokensResult> {
    const previousRefreshToken = session.refreshToken
    const newAccessToken = this.generateTempAccessToken(user)
    let newRefreshToken = this.generateRefreshToken(user)
    const newExpiresAt = new Date(Date.now() + this.RefreshTokenExpiry * 1000)

    let lastRefreshToken = null
    let lastRefreshTokenExpiresAt = null
    if (gracePeriod) {
      lastRefreshToken = previousRefreshToken
      lastRefreshTokenExpiresAt = new Date(Date.now() + this.RefreshTokenGracePeriod * 1000)
    }

    const [numUpdated] = await Database.sessionModel.update(
      {
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
        lastRefreshToken,
        lastRefreshTokenExpiresAt
      },
      {
        where: {
          id: session.id,
          refreshToken: previousRefreshToken
        }
      }
    )

    if (numUpdated === 0) {
      Logger.debug(`[TokenManager] Race condition in rotateTokensForSession for user ${user.id}, getting new token`)

      const updatedSession = await Database.sessionModel.findOne({ where: { id: session.id } })

      newRefreshToken = updatedSession.refreshToken
      session.refreshToken = updatedSession.refreshToken
      session.expiresAt = updatedSession.expiresAt
      session.lastRefreshToken = updatedSession.lastRefreshToken
      session.lastRefreshTokenExpiresAt = updatedSession.lastRefreshTokenExpiresAt
    } else {
      session.refreshToken = newRefreshToken
      session.expiresAt = newExpiresAt
      session.lastRefreshToken = lastRefreshToken
      session.lastRefreshTokenExpiresAt = lastRefreshTokenExpiresAt
    }

    if (newRefreshToken) {
      this.setRefreshTokenCookie(req, res, newRefreshToken)
    }

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }
  }

  /**
   * Check if the jwt is valid
   *
   * @param {JwtTokenPayload} jwt_payload
   * @param {Function} done - passportjs callback
   */
  async jwtAuthCheck(jwt_payload: JwtTokenPayload, done: (err: any, user?: any) => void): Promise<void> {
    if (jwt_payload.type === 'api') {
      const apiKey = await Database.apiKeyModel.getById(jwt_payload.keyId)

      if (!apiKey?.isActive) {
        done(null, null)
        return
      }

      if (jwt_payload.exp && jwt_payload.exp < Date.now() / 1000) {
        done(null, null)

        apiKey.isActive = false
        await apiKey.save()
        Logger.info(`[TokenManager] API key ${apiKey.id} is expired - deactivated`)
        return
      }

      const user = await Database.userModel.getUserById(apiKey.userId)

      if (!user?.isActive) {
        done(null, null)
        return
      }

      done(null, user)
    } else {
      if (!TokenManager.isBearerAccessTokenPayload(jwt_payload)) {
        done(null, null)
        return
      }

      if (jwt_payload.exp && jwt_payload.exp < Date.now() / 1000) {
        done(null, null)
        return
      }

      const user = await Database.userModel.getUserByIdOrOldId(jwt_payload.userId)

      if (!user?.isActive) {
        done(null, null)
        return
      }

      if (!jwt_payload.exp && !user.isOldToken) {
        Logger.debug(`[TokenManager] User ${user.username} is using an access token without an expiration`)
        user.isOldToken = true
      } else if (jwt_payload.exp && user.isOldToken !== undefined) {
        delete user.isOldToken
      }

      done(null, user)
    }
  }

  /**
   * Handle refresh token
   *
   * @param {string} refreshToken
   * @param {Request} req
   * @param {Response} res
   * @returns {Promise<RefreshTokenResult>}
   */
  async handleRefreshToken(refreshToken: string, req: Request, res: Response): Promise<RefreshTokenResult> {
    try {
      const decoded: JwtTokenPayload = jwt.verify(refreshToken, TokenManager.TokenSecret)

      if (decoded.type !== 'refresh') {
        Logger.error(`[TokenManager] Failed to refresh token. Invalid token type: ${decoded.type}`)
        return {
          error: 'Invalid token type'
        }
      }

      let session = await Database.sessionModel.findOne({
        where: {
          [Op.or]: [{ refreshToken: refreshToken }, { lastRefreshToken: refreshToken }]
        }
      })

      if (!session) {
        Logger.error(`[TokenManager] Failed to refresh token. Session not found`)
        return {
          error: 'Invalid refresh token'
        }
      }

      let isGracePeriod = false
      if (session.refreshToken !== refreshToken) {
        if (session.lastRefreshTokenExpiresAt && session.lastRefreshTokenExpiresAt > new Date()) {
          isGracePeriod = true
          Logger.debug(`[TokenManager] Grace period hit for user ${session.userId}`)
        } else {
          Logger.debug(`[TokenManager] Grace period expired for user ${session.userId}`)
          return {
            error: 'Invalid refresh token'
          }
        }
      } else {
        if (session.expiresAt < new Date()) {
          Logger.info(`[TokenManager] Session expired in database, cleaning up`)
          await session.destroy()
          return {
            error: 'Refresh token expired'
          }
        }
      }

      const user = await Database.userModel.getUserById(decoded.userId)
      if (!user?.isActive) {
        Logger.error(`[TokenManager] Failed to refresh token. User not found or inactive for user id: ${decoded.userId}`)
        return {
          error: 'User not found or inactive'
        }
      }

      if (isGracePeriod) {
        const accessToken = this.generateTempAccessToken(user)
        this.setRefreshTokenCookie(req, res, session.refreshToken)

        return {
          accessToken,
          refreshToken: session.refreshToken,
          user
        }
      }

      const newTokens = await this.rotateTokensForSession(session, user, req, res)
      return {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        user
      }
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        Logger.info(`[TokenManager] Refresh token expired, cleaning up session`)

        try {
          await Database.sessionModel.destroy({
            where: { refreshToken: refreshToken }
          })
          Logger.info(`[TokenManager] Expired session cleaned up`)
        } catch (cleanupError: any) {
          Logger.error(`[TokenManager] Error cleaning up expired session: ${cleanupError.message}`)
        }

        return {
          error: 'Refresh token expired'
        }
      } else if (error.name === 'JsonWebTokenError') {
        Logger.error(`[TokenManager] Invalid refresh token format: ${error.message}`)
        return {
          error: 'Invalid refresh token'
        }
      } else {
        Logger.error(`[TokenManager] Refresh token error: ${error.message}`)
        return {
          error: 'Invalid refresh token'
        }
      }
    }
  }

  /**
   * Invalidate all JWT sessions for a given user
   * If user is current user and refresh token is valid, rotate tokens for the current session
   *
   * @param {any} user
   * @param {Request} req
   * @param {Response} res
   * @returns {Promise<RotatedTokensResult | null>} new tokens for current session if kept alive
   */
  async invalidateJwtSessionsForUser(user: any, req: Request, res: Response): Promise<RotatedTokensResult | null> {
    const currentRefreshToken = req.cookies?.refresh_token || req.headers?.['x-refresh-token']
    if (req.user?.id === user.id && currentRefreshToken) {
      const currentSession = await Database.sessionModel.findOne({
        where: {
          userId: user.id,
          [Op.or]: [{ refreshToken: currentRefreshToken }, { lastRefreshToken: currentRefreshToken }]
        }
      })
      if (currentSession) {
        const newTokens = await this.rotateTokensForSession(currentSession, user, req, res, false)

        await Database.sessionModel.destroy({
          where: {
            id: {
              [Op.ne]: currentSession.id
            },
            userId: user.id
          }
        })

        return {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken
        }
      } else {
        Logger.error(`[TokenManager] No session found to rotate tokens`)
      }
    }

    await Database.sessionModel.destroy({ where: { userId: user.id } })
    return null
  }

  /**
   * Destroy all JWT sessions for the user that owns this refresh token
   *
   * @param {string} refreshToken
   */
  async invalidateAllSessionsForRefreshToken(refreshToken: string): Promise<void> {
    if (!refreshToken) return

    const session = await Database.sessionModel.findOne({
      where: {
        [Op.or]: [{ refreshToken: refreshToken }, { lastRefreshToken: refreshToken }]
      }
    })
    if (!session) return

    const numDeleted = await Database.sessionModel.destroy({ where: { userId: session.userId } })
    Logger.info(`[TokenManager] Invalidated all JWT sessions for user ${session.userId}, ${numDeleted} deleted`)
  }

  /**
   * Invalidate a refresh token - used for logout
   *
   * @param {string} refreshToken
   * @returns {Promise<boolean>}
   */
  async invalidateRefreshToken(refreshToken: string): Promise<boolean> {
    if (!refreshToken) {
      Logger.error(`[TokenManager] No refresh token provided to invalidate`)
      return false
    }

    try {
      const numDeleted = await Database.sessionModel.destroy({ where: { refreshToken: refreshToken } })
      Logger.info(`[TokenManager] Refresh token invalidated, ${numDeleted} sessions deleted`)
      return true
    } catch (error: any) {
      Logger.error(`[TokenManager] Error invalidating refresh token: ${error.message}`)
      return false
    }
  }
}

module.exports = TokenManager
