export interface JwtTokenPayload {
  userId: string
  username: string
  type?: string
  keyId?: string
  jti?: string
  exp?: number
  iat?: number
  [key: string]: unknown
}

export interface UserLoginResponsePayload {
  user: any
  userDefaultLibraryId: string | null
  serverSettings: any
  ereaderDevices: any[]
  Source: string
  [key: string]: unknown
}

export interface TokensAndSessionResult {
  accessToken: string | null
  refreshToken: string | null
  session: any
}

export interface RotatedTokensResult {
  accessToken: string | null
  refreshToken: string | null
}

export interface RefreshTokenResult {
  accessToken?: string | null
  refreshToken?: string | null
  user?: any
  error?: string
}

export interface OpenIdIssuerConfig {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  end_session_endpoint?: string
  jwks_uri: string
  id_token_signing_alg_values_supported?: string[]
}
