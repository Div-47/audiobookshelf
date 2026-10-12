import type { Request, Response } from '../types/express'
import type { OpenIdIssuerConfig } from '../types/Auth'

const { LRUCache } = require('lru-cache')
const passport = require('passport')
const OpenIDClient = require('openid-client')
const axios = require('axios')
const Database = require('../Database')
const Logger = require('../Logger')
const { getRequestOrigin } = require('../utils/requestUtils')

/**
 * OpenID Connect authentication strategy
 */
class OidcAuthStrategy {
  name: string
  strategy: any
  client: any
  openIdAuthSession: any

  constructor() {
    this.name = 'openid-client'
    this.strategy = null
    this.client = null
    // Map of openId sessions indexed by oauth2 state-variable
    this.openIdAuthSession = new LRUCache({
      ttl: 10 * 60 * 1000,
      ttlAutopurge: true
    })
  }

  /**
   * Get the passport strategy instance
   * @returns {any}
   */
  getStrategy(): any {
    if (!this.strategy) {
      this.strategy = new OpenIDClient.Strategy(
        {
          client: this.getClient(),
          params: {
            redirect_uri: `${(global as any).ServerSettings?.authOpenIDSubfolderForRedirectURLs}/auth/openid/callback`,
            scope: this.getScope()
          }
        },
        this.verifyCallback.bind(this)
      )
    }
    return this.strategy
  }

  /**
   * Get the OpenID Connect client
   * @returns {any}
   */
  getClient(): any {
    if (!this.client) {
      if (!Database.serverSettings.isOpenIDAuthSettingsValid) {
        throw new Error('OpenID Connect settings are not valid')
      }

      // Custom req timeout see: https://github.com/panva/node-openid-client/blob/main/docs/README.md#customizing
      OpenIDClient.custom.setHttpOptionsDefaults({ timeout: 10000 })

      const openIdIssuerClient = new OpenIDClient.Issuer({
        issuer: (global as any).ServerSettings?.authOpenIDIssuerURL,
        authorization_endpoint: (global as any).ServerSettings?.authOpenIDAuthorizationURL,
        token_endpoint: (global as any).ServerSettings?.authOpenIDTokenURL,
        userinfo_endpoint: (global as any).ServerSettings?.authOpenIDUserInfoURL,
        jwks_uri: (global as any).ServerSettings?.authOpenIDJwksURL,
        end_session_endpoint: (global as any).ServerSettings?.authOpenIDLogoutURL
      }).Client

      this.client = new openIdIssuerClient({
        client_id: (global as any).ServerSettings?.authOpenIDClientID,
        client_secret: (global as any).ServerSettings?.authOpenIDClientSecret,
        id_token_signed_response_alg: (global as any).ServerSettings?.authOpenIDTokenSigningAlgorithm
      })
    }
    return this.client
  }

  /**
   * Get the scope string for the OpenID Connect request
   * @returns {string}
   */
  getScope(): string {
    let scope = 'openid profile email'
    if ((global as any).ServerSettings?.authOpenIDGroupClaim) {
      scope += ' ' + (global as any).ServerSettings.authOpenIDGroupClaim
    }
    if ((global as any).ServerSettings?.authOpenIDAdvancedPermsClaim) {
      scope += ' ' + (global as any).ServerSettings.authOpenIDAdvancedPermsClaim
    }
    return scope
  }

  /**
   * Initialize the strategy with passport
   */
  init(): void {
    if (!Database.serverSettings.isOpenIDAuthSettingsValid) {
      Logger.error(`[OidcAuth] Cannot init openid auth strategy - invalid settings`)
      return
    }
    passport.use(this.name, this.getStrategy())
  }

  /**
   * Remove the strategy from passport
   */
  unuse(): void {
    passport.unuse(this.name)
    this.strategy = null
    this.client = null
  }

  /**
   * Verify callback for OpenID Connect authentication
   * @param {any} tokenset
   * @param {any} userinfo
   * @param {Function} done - Passport callback
   */
  async verifyCallback(tokenset: any, userinfo: any, done: (err: any, user?: any, info?: any) => void): Promise<void> {
    let isNewUser = false
    let user: any = null
    try {
      Logger.debug(`[OidcAuth] openid callback userinfo=`, JSON.stringify(userinfo, null, 2))

      if (!userinfo.sub) {
        throw new Error('Invalid userinfo, no sub')
      }

      if (!this.validateGroupClaim(userinfo)) {
        throw new Error(`Group claim ${Database.serverSettings.authOpenIDGroupClaim} not found or empty in userinfo`)
      }

      user = await Database.userModel.findUserFromOpenIdUserInfo(userinfo)

      if (user?.error) {
        throw new Error('Invalid userinfo or already linked')
      }

      if (!user) {
        if ((global as any).ServerSettings?.authOpenIDAutoRegister) {
          Logger.info(`[User] openid: Auto-registering user with sub "${userinfo.sub}"`, userinfo)
          user = await Database.userModel.createUserFromOpenIdUserInfo(userinfo)
          isNewUser = true
        } else {
          Logger.warn(`[User] openid: User not found and auto-register is disabled`)
        }
      }

      if (!user?.isActive) {
        throw new Error('User not active or not found')
      }

      await this.setUserGroup(user, userinfo)
      await this.updateUserPermissions(user, userinfo)

      user.openid_id_token = tokenset.id_token

      return done(null, user)
    } catch (error: any) {
      Logger.error(`[OidcAuth] openid callback error: ${error?.message}\n${error?.stack}`)
      if (isNewUser && user) {
        await user.destroy()
      }
      return done(null, null, 'Unauthorized')
    }
  }

  /**
   * Validates the presence and content of the group claim in userinfo.
   * @param {any} userinfo
   * @returns {boolean}
   */
  validateGroupClaim(userinfo: any): boolean {
    const groupClaimName = Database.serverSettings.authOpenIDGroupClaim
    if (!groupClaimName) return true

    if (!userinfo[groupClaimName]) {
      return false
    }
    return true
  }

  /**
   * Sets the user group based on group claim in userinfo.
   * @param {any} user
   * @param {any} userinfo
   */
  async setUserGroup(user: any, userinfo: any): Promise<void> {
    const groupClaimName = Database.serverSettings.authOpenIDGroupClaim
    if (!groupClaimName) return

    if (!userinfo[groupClaimName]) throw new Error(`Group claim ${groupClaimName} not found in userinfo`)

    const groupsList: string[] = userinfo[groupClaimName].map((group: string) => group.toLowerCase())
    const rolesInOrderOfPriority = ['admin', 'user', 'guest']

    let userType = rolesInOrderOfPriority.find((role) => groupsList.includes(role))
    if (userType) {
      if (user.type === 'root') {
        if (userType !== 'admin') {
          throw new Error(`Root user "${user.username}" cannot be downgraded to ${userType}. Denying login.`)
        } else {
          return
        }
      }

      if (user.type !== userType) {
        Logger.info(`[OidcAuth] openid callback: Updating user "${user.username}" type to "${userType}" from "${user.type}"`)
        user.type = userType
        await user.save()
      }
    } else {
      throw new Error(`No valid group found in userinfo: ${JSON.stringify(userinfo[groupClaimName], null, 2)}`)
    }
  }

  /**
   * Updates user permissions based on the advanced permissions claim.
   * @param {any} user
   * @param {any} userinfo
   */
  async updateUserPermissions(user: any, userinfo: any): Promise<void> {
    const absPermissionsClaim = Database.serverSettings.authOpenIDAdvancedPermsClaim
    if (!absPermissionsClaim) return

    if (user.type === 'admin' || user.type === 'root') return

    const absPermissions = userinfo[absPermissionsClaim]
    if (!absPermissions) throw new Error(`Advanced permissions claim ${absPermissionsClaim} not found in userinfo`)

    if (await user.updatePermissionsFromExternalJSON(absPermissions)) {
      Logger.info(`[OidcAuth] openid callback: Updating advanced perms for user "${user.username}" using "${JSON.stringify(absPermissions)}"`)
    }
  }

  /**
   * Generate PKCE parameters for the authorization request
   * @param {Request} req
   * @param {boolean} isMobileFlow
   * @returns {any}
   */
  generatePkce(req: Request, isMobileFlow: boolean): any {
    if (isMobileFlow) {
      if (!req.query?.code_challenge) {
        return {
          error: 'code_challenge required for mobile flow (PKCE)'
        }
      }
      if (req.query.code_challenge_method && req.query.code_challenge_method !== 'S256') {
        return {
          error: 'Only S256 code_challenge_method method supported'
        }
      }
      return {
        code_challenge: req.query.code_challenge,
        code_challenge_method: req.query.code_challenge_method || 'S256'
      }
    } else {
      const code_verifier = OpenIDClient.generators.codeVerifier()
      const code_challenge = OpenIDClient.generators.codeChallenge(code_verifier)
      return { code_challenge, code_challenge_method: 'S256', code_verifier }
    }
  }

  /**
   * Check if a redirect URI is valid
   * @param {string} uri
   * @returns {boolean}
   */
  isValidRedirectUri(uri: string): boolean {
    const whitelist: string[] = Database.serverSettings.authOpenIDMobileRedirectURIs || []
    return whitelist.includes(uri) || (whitelist.length === 1 && whitelist[0] === '*')
  }

  /**
   * Get the authorization URL for OpenID Connect
   * @param {Request} req
   * @returns {any}
   */
  getAuthorizationUrl(req: Request): any {
    const client = this.getClient()
    const strategy = this.getStrategy()
    const sessionKey = strategy._key

    try {
      const { origin } = getRequestOrigin(req)
      const hostUrl = new URL(origin)
      const isMobileFlow = req.query?.response_type === 'code' || req.query?.redirect_uri || req.query?.code_challenge

      if (req.query?.response_type && req.query.response_type !== 'code') {
        Logger.debug(`[OidcAuth] OIDC Invalid response_type=${req.query.response_type}`)
        return {
          status: 400,
          error: 'Invalid response_type, only code supported'
        }
      }

      const state = !isMobileFlow || !req.query?.state ? OpenIDClient.generators.random() : req.query.state

      let redirectUri: string
      if (isMobileFlow) {
        if (!req.query?.redirect_uri || !this.isValidRedirectUri(req.query.redirect_uri)) {
          Logger.debug(`[OidcAuth] Invalid redirect_uri=${req.query?.redirect_uri}`)
          return {
            status: 400,
            error: 'Invalid redirect_uri'
          }
        }
        this.openIdAuthSession.set(state, { mobile_redirect_uri: req.query.redirect_uri })

        redirectUri = new URL(`${(global as any).ServerSettings?.authOpenIDSubfolderForRedirectURLs}/auth/openid/mobile-redirect`, hostUrl).toString()
      } else {
        redirectUri = new URL(`${(global as any).ServerSettings?.authOpenIDSubfolderForRedirectURLs}/auth/openid/callback`, hostUrl).toString()

        if (req.query?.state) {
          Logger.debug(`[OidcAuth] Invalid state - not allowed on web openid flow`)
          return {
            status: 400,
            error: 'Invalid state, not allowed on web flow'
          }
        }
      }

      strategy._params.redirect_uri = redirectUri
      Logger.debug(`[OidcAuth] OIDC redirect_uri=${redirectUri}`)

      const pkceData = this.generatePkce(req, isMobileFlow)
      if (pkceData.error) {
        return {
          status: 400,
          error: pkceData.error
        }
      }

      if (req.session) {
        req.session[sessionKey] = {
          ...req.session[sessionKey],
          state: state,
          max_age: strategy._params.max_age,
          response_type: 'code',
          code_verifier: pkceData.code_verifier,
          mobile: req.query?.redirect_uri,
          sso_redirect_uri: redirectUri
        }
      }

      const authorizationUrl = client.authorizationUrl({
        ...strategy._params,
        redirect_uri: redirectUri,
        state: state,
        response_type: 'code',
        scope: this.getScope(),
        code_challenge: pkceData.code_challenge,
        code_challenge_method: pkceData.code_challenge_method
      })

      return {
        authorizationUrl,
        isMobileFlow
      }
    } catch (error: any) {
      Logger.error(`[OidcAuth] Error generating authorization URL: ${error}\n${error?.stack}`)
      return {
        status: 500,
        error: error.message || 'Unknown error'
      }
    }
  }

  /**
   * Get the end session URL for logout
   * @param {Request} req
   * @param {string} idToken
   * @param {string} authMethod
   * @returns {string | null}
   */
  getEndSessionUrl(req: Request, idToken: string, authMethod: string): string | null {
    const client = this.getClient()

    if (client.issuer.end_session_endpoint && client.issuer.end_session_endpoint.length > 0) {
      let postLogoutRedirectUri: string | null = null

      if (authMethod === 'openid') {
        const { origin } = getRequestOrigin(req)
        postLogoutRedirectUri = `${origin}${(global as any).RouterBasePath}/login`
      }

      return client.endSessionUrl({
        id_token_hint: idToken,
        post_logout_redirect_uri: postLogoutRedirectUri
      })
    }

    return null
  }

  /**
   * Get OpenID Connect configuration from an issuer URL
   * @param {string} issuerUrl
   * @returns {Promise<OpenIdIssuerConfig | { status: number, error: string }>}
   */
  async getIssuerConfig(issuerUrl: string): Promise<OpenIdIssuerConfig | { status: number; error: string }> {
    if (issuerUrl.endsWith('/')) issuerUrl = issuerUrl.slice(0, -1)

    let configUrl: URL | null = null
    try {
      configUrl = new URL(`${issuerUrl}/.well-known/openid-configuration`)
      if (!configUrl.pathname.endsWith('/.well-known/openid-configuration')) {
        throw new Error('Invalid pathname')
      }
    } catch (error) {
      Logger.error(`[OidcAuth] Failed to get openid configuration. Invalid URL "${configUrl}"`, error)
      return {
        status: 400,
        error: "Invalid request. Query param 'issuer' is invalid"
      }
    }

    try {
      const { data } = await axios.get(configUrl.toString())
      return {
        issuer: data.issuer,
        authorization_endpoint: data.authorization_endpoint,
        token_endpoint: data.token_endpoint,
        userinfo_endpoint: data.userinfo_endpoint,
        end_session_endpoint: data.end_session_endpoint,
        jwks_uri: data.jwks_uri,
        id_token_signing_alg_values_supported: data.id_token_signing_alg_values_supported
      }
    } catch (error) {
      Logger.error(`[OidcAuth] Failed to get openid configuration at "${configUrl}"`, error)
      return {
        status: 400,
        error: 'Failed to get openid configuration'
      }
    }
  }

  /**
   * Handle mobile redirect for OAuth2 callback
   * @param {Request} req
   * @param {Response} res
   */
  handleMobileRedirect(req: Request, res: Response): any {
    try {
      const { state, code } = req.query || {}

      if (!state || !this.openIdAuthSession.has(state)) {
        Logger.error('[OidcAuth] /auth/openid/mobile-redirect route: State parameter mismatch')
        return res.status(400).send('State parameter mismatch')
      }

      let mobile_redirect_uri = this.openIdAuthSession.get(state).mobile_redirect_uri

      if (!mobile_redirect_uri) {
        Logger.error('[OidcAuth] No redirect URI')
        return res.status(400).send('No redirect URI')
      }

      this.openIdAuthSession.delete(state)

      const redirectUri = `${mobile_redirect_uri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
      res.redirect(redirectUri)
    } catch (error: any) {
      Logger.error(`[OidcAuth] Error in /auth/openid/mobile-redirect route: ${error}\n${error?.stack}`)
      res.status(500).send('Internal Server Error')
    }
  }

  /**
   * Validates if a callback URL is safe for redirect (same-origin only)
   * @param {string} callbackUrl
   * @param {Request} req
   * @returns {boolean}
   */
  isValidWebCallbackUrl(callbackUrl: string, req: Request): boolean {
    if (!callbackUrl) return false

    try {
      if (callbackUrl.startsWith('//') || callbackUrl.startsWith('/\\')) {
        Logger.warn(`[OidcAuth] Rejected protocol-relative callback URL: ${callbackUrl}`)
        return false
      }

      const { origin: serverOrigin } = getRequestOrigin(req)
      const resolvedUrl = callbackUrl.startsWith('/') ? new URL(callbackUrl, serverOrigin) : new URL(callbackUrl)

      if (resolvedUrl.origin !== serverOrigin) {
        Logger.warn(`[OidcAuth] Rejected callback URL to different origin: ${callbackUrl} (expected ${serverOrigin})`)
        return false
      }

      const pathname = decodeURIComponent(resolvedUrl.pathname)
      if (pathname.startsWith('//') || pathname.startsWith('/\\')) {
        Logger.warn(`[OidcAuth] Rejected protocol-relative callback URL path: ${callbackUrl}`)
        return false
      }

      if (!resolvedUrl.pathname.startsWith((global as any).RouterBasePath + '/')) {
        Logger.warn(`[OidcAuth] Rejected callback URL outside router base path: ${callbackUrl}`)
        return false
      }

      return true
    } catch (error) {
      Logger.error(`[OidcAuth] Invalid callback URL format: ${callbackUrl}`, error)
      return false
    }
  }
}

module.exports = OidcAuthStrategy
