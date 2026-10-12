import type { Request, Response } from './types/express'
import type { UserLoginResponsePayload, RotatedTokensResult } from './types/Auth'

const passport = require('passport')
const JwtStrategy = require('passport-jwt').Strategy
const ExtractJwt = require('passport-jwt').ExtractJwt

const Database = require('./Database')
const Logger = require('./Logger')
const TokenManager = require('./auth/TokenManager')
const LocalAuthStrategy = require('./auth/LocalAuthStrategy')
const OidcAuthStrategy = require('./auth/OidcAuthStrategy')

const RateLimiterFactory = require('./utils/rateLimiterFactory')
const { escapeRegExp } = require('./utils')

/**
 * Class for handling all the authentication related functionality.
 */
class Auth {
  ignorePatterns: RegExp[]
  authRateLimiter: any
  tokenManager: any
  localAuthStrategy: any
  oidcAuthStrategy: any

  constructor() {
    const escapedRouterBasePath = escapeRegExp((global as any).RouterBasePath || '')
    this.ignorePatterns = [new RegExp(`^(${escapedRouterBasePath}/api)?/items/[^/]+/cover$`), new RegExp(`^(${escapedRouterBasePath}/api)?/authors/[^/]+/image$`)]

    this.authRateLimiter = RateLimiterFactory.getAuthRateLimiter()

    this.tokenManager = new TokenManager()
    this.localAuthStrategy = new LocalAuthStrategy()
    this.oidcAuthStrategy = new OidcAuthStrategy()
  }

  /**
   * Checks if the request should not be authenticated.
   * @param {Request} req
   * @returns {boolean}
   */
  authNotNeeded(req: Request): boolean {
    return req.method === 'GET' && this.ignorePatterns.some((pattern) => pattern.test(req.path || ''))
  }

  /**
   * Middleware to register passport in express-session
   *
   * @param {function} middleware
   */
  ifAuthNeeded(middleware: (req: Request, res: Response, next: (err?: any) => void) => void): (req: Request, res: Response, next: (err?: any) => void) => void {
    return (req: Request, res: Response, next: (err?: any) => void) => {
      if (this.authNotNeeded(req)) {
        return next()
      }
      middleware(req, res, next)
    }
  }

  /**
   * middleware to use in express to only allow authenticated users.
   *
   * @param {Request} req
   * @param {Response} res
   * @param {function} next
   */
  isAuthenticated(req: Request, res: Response, next: (err?: any) => void): any {
    return passport.authenticate('jwt', { session: false })(req, res, next)
  }

  /**
   * Function to generate a jwt token for a given user
   * @deprecated
   *
   * @param {{ id:string, username:string }} user
   * @returns {string}
   */
  generateAccessToken(user: { id: string; username: string }): string {
    return this.tokenManager.generateAccessToken(user)
  }

  /**
   * Invalidate all JWT sessions for a given user
   * If user is current user and refresh token is valid, rotate tokens for the current session
   *
   * @param {any} user
   * @param {Request} req
   * @param {Response} res
   * @returns {Promise<RotatedTokensResult | null>}
   */
  async invalidateJwtSessionsForUser(user: any, req: Request, res: Response): Promise<RotatedTokensResult | null> {
    return this.tokenManager.invalidateJwtSessionsForUser(user, req, res)
  }

  /**
   * Return the login info payload for a user
   *
   * @param {any} user
   * @returns {Promise<UserLoginResponsePayload>} jsonPayload
   */
  async getUserLoginResponsePayload(user: any): Promise<UserLoginResponsePayload> {
    const libraryIds = await Database.libraryModel.getAllLibraryIds()
    return {
      user: user.toOldJSONForBrowser(),
      userDefaultLibraryId: user.getDefaultLibraryId(libraryIds),
      serverSettings: Database.serverSettings.toJSONForBrowser(),
      ereaderDevices: Database.emailSettings.getEReaderDevices(user),
      Source: (global as any).Source
    }
  }

  // #region Passport strategies
  /**
   * Initializes all passportjs strategies and other passportjs related initialization.
   */
  async initPassportJs(): Promise<void> {
    const authActiveAuthMethods: string[] = (global as any).ServerSettings?.authActiveAuthMethods || []

    if (authActiveAuthMethods.includes('local')) {
      this.localAuthStrategy.init()
    }

    if (authActiveAuthMethods.includes('openid')) {
      this.oidcAuthStrategy.init()
    }

    passport.use(
      new JwtStrategy(
        {
          jwtFromRequest: ExtractJwt.fromExtractors([ExtractJwt.fromAuthHeaderAsBearerToken(), ExtractJwt.fromUrlQueryParameter('token')]),
          secretOrKey: TokenManager.TokenSecret,
          ignoreExpiration: true
        },
        this.tokenManager.jwtAuthCheck.bind(this)
      )
    )

    passport.serializeUser(function (user: any, cb: (err: any, id?: any) => void) {
      process.nextTick(function () {
        return cb(
          null,
          JSON.stringify({
            id: user.id
          })
        )
      })
    })

    passport.deserializeUser(
      function (this: any, user: string, cb: (err: any, user?: any) => void) {
        process.nextTick(
          async function (this: any) {
            const parsedUserInfo = JSON.parse(user)
            const dbUser = await Database.userModel.getUserById(parsedUserInfo.id)
            return cb(null, dbUser)
          }.bind(this)
        )
      }.bind(this)
    )
  }
  // #endregion

  /**
   * Unuse strategy
   *
   * @param {string} name
   */
  unuseAuthStrategy(name: string): void {
    if (name === 'openid') {
      this.oidcAuthStrategy.unuse()
    } else if (name === 'local') {
      this.localAuthStrategy.unuse()
    } else {
      Logger.error('[Auth] Invalid auth strategy ' + name)
    }
  }

  /**
   * Use strategy
   *
   * @param {string} name
   */
  useAuthStrategy(name: string): void {
    if (name === 'openid') {
      this.oidcAuthStrategy.init()
    } else if (name === 'local') {
      this.localAuthStrategy.init()
    } else {
      Logger.error('[Auth] Invalid auth strategy ' + name)
    }
  }

  /**
   * Returns if the given auth method is API based.
   *
   * @param {string} authMethod
   * @returns {boolean}
   */
  isAuthMethodAPIBased(authMethod: string): boolean {
    return ['api', 'openid-mobile'].includes(authMethod)
  }

  /**
   * Stores the client's choice of login callback method in temporary cookies.
   *
   * @param {Request} req
   * @param {Response} res
   * @param {string} authMethod
   * @returns {any}
   */
  paramsToCookies(req: Request, res: Response, authMethod = 'local'): any {
    const TEN_MINUTES = 10 * 60 * 1000
    const callback = req.query?.redirect_uri || req.query?.callback

    if (!this.isAuthMethodAPIBased(authMethod)) {
      if (req.query?.state) {
        res.cookie('auth_state', req.query.state, { maxAge: TEN_MINUTES, httpOnly: true })
      }

      if (!callback) {
        res.status(400).send({ message: 'No callback parameter' })
        return { error: 'No callback parameter' }
      }

      if (!this.oidcAuthStrategy.isValidWebCallbackUrl(callback, req)) {
        Logger.warn(`[Auth] Rejected invalid callback URL: ${callback}`)
        res.status(400).send({ message: 'Invalid callback URL - must be same-origin' })
        return { error: 'Invalid callback URL - must be same-origin' }
      }

      res.cookie('auth_cb', callback, { maxAge: TEN_MINUTES, httpOnly: true })
    }

    Logger.debug(`[Auth] paramsToCookies: setting auth_method cookie to ${authMethod}`)
    res.cookie('auth_method', authMethod, { maxAge: 1000 * 60 * 60 * 24 * 365 * 10, httpOnly: true })
    return null
  }

  /**
   * Informs the client in the right mode about a successful login and token
   *
   * @param {Request} req
   * @param {Response} res
   */
  async handleLoginSuccessBasedOnCookie(req: Request, res: Response): Promise<void> {
    const isApiBased = this.isAuthMethodAPIBased(req.cookies?.auth_method)
    Logger.debug(`[Auth] handleLoginSuccessBasedOnCookie: isApiBased: ${isApiBased}, auth_method: ${req.cookies?.auth_method}`)
    const userResponse = await this.handleLoginSuccess(req, res, isApiBased)

    if (isApiBased) {
      res.json(userResponse)
    } else {
      if (req.cookies?.auth_cb) {
        let stateQuery = req.cookies.auth_state ? `&state=${req.cookies.auth_state}` : ''
        res.redirect(302, `${req.cookies.auth_cb}?setToken=${userResponse.user.token}&accessToken=${userResponse.user.accessToken}${stateQuery}`)
      } else {
        Logger.error('[Auth] No callback or already expired')
        res.redirect(`/login?error=${encodeURIComponent('No callback or already expired')}&autoLaunch=0`)
      }
    }
  }

  /**
   * After login success from local or oidc
   *
   * @param {Request} req
   * @param {Response} res
   * @param {boolean} returnTokens
   */
  async handleLoginSuccess(req: Request, res: Response, returnTokens = false): Promise<UserLoginResponsePayload> {
    const { accessToken, refreshToken } = await this.tokenManager.createTokensAndSession(req.user, req)

    const userResponse = await this.getUserLoginResponsePayload(req.user)

    userResponse.user.refreshToken = returnTokens ? refreshToken : null
    userResponse.user.accessToken = accessToken

    Logger.debug(`[Auth] handleLoginSuccess: returnTokens: ${returnTokens}, isRefreshTokenInResponse: ${!!userResponse.user.refreshToken}`)

    if (!returnTokens && refreshToken) {
      this.tokenManager.setRefreshTokenCookie(req, res, refreshToken)
    }

    return userResponse
  }

  // #region Auth routes
  /**
   * Creates all (express) routes required for authentication.
   *
   * @param {any} router
   */
  async initAuthRoutes(router: any): Promise<void> {
    router.post('/login', this.authRateLimiter, passport.authenticate('local'), async (req: Request, res: Response) => {
      const returnTokens = req.headers?.['x-return-tokens'] === 'true'

      const userResponse = await this.handleLoginSuccess(req, res, returnTokens)
      res.json(userResponse)
    })

    router.post('/auth/refresh', this.authRateLimiter, async (req: Request, res: Response) => {
      let refreshToken = req.cookies?.refresh_token

      let shouldReturnRefreshToken = false
      if (req.headers?.['x-refresh-token']) {
        refreshToken = req.headers['x-refresh-token']
        shouldReturnRefreshToken = true
      }

      if (!refreshToken) {
        Logger.error(`[Auth] Failed to refresh token. No refresh token provided`)
        return res.status(401).json({ error: 'No refresh token provided' })
      }

      Logger.debug(`[Auth] refreshing token. shouldReturnRefreshToken: ${shouldReturnRefreshToken}`)

      const refreshResponse = await this.tokenManager.handleRefreshToken(refreshToken, req, res)
      if (refreshResponse.error) {
        return res.status(401).json({ error: refreshResponse.error })
      }

      const userResponse = await this.getUserLoginResponsePayload(refreshResponse.user)

      userResponse.user.accessToken = refreshResponse.accessToken
      userResponse.user.refreshToken = shouldReturnRefreshToken ? refreshResponse.refreshToken : null
      res.json(userResponse)
    })

    router.get('/auth/openid', this.authRateLimiter, (req: Request, res: Response) => {
      const authorizationUrlResponse = this.oidcAuthStrategy.getAuthorizationUrl(req)

      if (authorizationUrlResponse.error) {
        return res.status(authorizationUrlResponse.status).send(authorizationUrlResponse.error)
      }

      const cookieResult = this.paramsToCookies(req, res, authorizationUrlResponse.isMobileFlow ? 'openid-mobile' : 'openid')
      if (cookieResult && cookieResult.error) {
        return
      }

      res.redirect(authorizationUrlResponse.authorizationUrl)
    })

    router.get('/auth/openid/mobile-redirect', this.authRateLimiter, (req: Request, res: Response) => this.oidcAuthStrategy.handleMobileRedirect(req, res))

    router.get(
      '/auth/openid/callback',
      this.authRateLimiter,
      (req: Request, res: Response, next: (err?: any) => void) => {
        const sessionKey = this.oidcAuthStrategy.getStrategy()._key

        if (!req.session?.[sessionKey]) {
          const isMobile = req.cookies?.auth_method === 'openid-mobile' || !!req.query?.code_verifier
          Logger.error('[Auth] /auth/openid/callback route: No session')
          if (isMobile) {
            return res.status(400).send('No session')
          }
          return res.redirect(`/login?error=${encodeURIComponent('No sign-in session')}&autoLaunch=0`)
        }

        if (req.query?.code_verifier) {
          req.session[sessionKey].code_verifier = req.query.code_verifier
        }

        function handleAuthError(isMobile: boolean, errorCode: number, errorMessage: string, logMessage: any, response?: any) {
          Logger.error(JSON.stringify(logMessage, null, 2))
          if (response) {
            const header = response.req?._header.replace(/Authorization: [^\r\n]*/i, 'Authorization: REDACTED')
            Logger.debug(header + '\n' + JSON.stringify(response.body, null, 2))
          }

          if (isMobile) {
            return res.status(errorCode).send(errorMessage)
          } else {
            return res.redirect(`/login?error=${encodeURIComponent(errorMessage)}&autoLaunch=0`)
          }
        }

        function passportCallback(req: Request, res: Response, next: (err?: any) => void) {
          return (err: any, user: any, info: any) => {
            const isMobile = req.session?.[sessionKey]?.mobile === true
            if (err) {
              return handleAuthError(isMobile, 500, 'Error in callback', `[Auth] Error in openid callback - ${err}`, err?.response)
            }

            if (!user) {
              return handleAuthError(isMobile, 401, 'Unauthorized', `[Auth] No data in openid callback - ${info}`, info?.response)
            }

            req.logIn?.(user, (loginError: any) => {
              if (loginError) {
                return handleAuthError(isMobile, 500, 'Error during login', `[Auth] Error in openid callback: ${loginError}`)
              }

              res.cookie('openid_id_token', user.openid_id_token, { maxAge: 1000 * 60 * 60 * 24 * 365 * 10, httpOnly: true, secure: true, sameSite: 'Strict' })
              next()
            })
          }
        }

        return passport.authenticate('openid-client', { redirect_uri: req.session[sessionKey].sso_redirect_uri }, passportCallback(req, res, next))(req, res, next)
      },
      this.handleLoginSuccessBasedOnCookie.bind(this)
    )

    router.get('/auth/openid/config', this.authRateLimiter, this.isAuthenticated, async (req: Request, res: Response) => {
      if (!req.user?.isAdminOrUp) {
        Logger.error(`[Auth] Non-admin user "${req.user?.username}" attempted to get issuer config`)
        return res.sendStatus(403)
      }

      if (!req.query?.issuer || typeof req.query.issuer !== 'string') {
        return res.status(400).send("Invalid request. Query param 'issuer' is required")
      }

      const openIdIssuerConfig = await this.oidcAuthStrategy.getIssuerConfig(req.query.issuer)
      if (openIdIssuerConfig.error) {
        return res.status(openIdIssuerConfig.status).send(openIdIssuerConfig.error)
      }

      res.json(openIdIssuerConfig)
    })

    router.post('/logout', async (req: Request, res: Response) => {
      const refreshToken = req.cookies?.refresh_token || req.headers?.['x-refresh-token']
      const allDevices = req.query?.allDevices === '1'

      res.clearCookie('refresh_token', {
        path: '/'
      })

      if (allDevices) {
        await this.tokenManager.invalidateAllSessionsForRefreshToken(refreshToken)
      } else if (refreshToken) {
        await this.tokenManager.invalidateRefreshToken(refreshToken)
      } else {
        Logger.info(`[Auth] logout: No refresh token on request`)
      }

      req.logout?.((err: any) => {
        if (err) {
          res.sendStatus(500)
        } else {
          const authMethod = req.cookies?.auth_method

          res.clearCookie('auth_method')

          let logoutUrl: string | null = null

          if (authMethod === 'openid' || authMethod === 'openid-mobile') {
            logoutUrl = this.oidcAuthStrategy.getEndSessionUrl(req, req.cookies?.openid_id_token, authMethod)
            res.clearCookie('openid_id_token')
          }

          res.send({ redirect_url: logoutUrl })
        }
      })
    })
  }
  // #endregion
}

module.exports = Auth
