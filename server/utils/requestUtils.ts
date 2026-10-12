/**
 * Whether the request was made over HTTPS.
 * Uses Express `req.secure` and `x-forwarded-proto`
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
interface RequestLike {
  secure: boolean
  get(name: string): string | undefined
}

function isRequestSecure(req: RequestLike): boolean {
  if (req.secure) return true
  const xfp = (req.get('x-forwarded-proto') || '').toLowerCase()
  // Nginx Proxy Manager sends "http, https"; see https://github.com/advplyr/audiobookshelf/pull/4635
  return (
    xfp === 'https' ||
    xfp
      .split(',')
      .map((s: string) => s.trim())
      .includes('https')
  )
}

/**
 * @param {import('express').Request} req
 * @returns {'https' | 'http'}
 */
function getRequestProtocol(req: RequestLike): 'https' | 'http' {
  return isRequestSecure(req) ? 'https' : 'http'
}

/**
 * @param {import('express').Request} req
 * @returns {{ protocol: 'https' | 'http', host: string, origin: string }}
 */
function getRequestOrigin(req: RequestLike): { protocol: 'https' | 'http'; host: string | undefined; origin: string } {
  const protocol = getRequestProtocol(req)
  const host = req.get('host')
  return { protocol, host, origin: `${protocol}://${host}` }
}

module.exports = {
  isRequestSecure,
  getRequestProtocol,
  getRequestOrigin
}
