const uaParserJs = require('../../libs/uaParser')

interface UserAgentParts {
  browser?: { name?: string; version?: string }
  os?: { name?: string; version?: string }
  device?: { type?: string; model?: string; vendor?: string }
}
type DeviceInfo = Partial<Record<'browserName' | 'browserVersion' | 'osName' | 'osVersion' | 'deviceType' | 'model' | 'vendor', string>>

/**
 * @param {string|null|undefined} userAgent
 * @returns {{ browserName?:string, browserVersion?:string, osName?:string, osVersion?:string, deviceType?:string, model?:string, vendor?:string }|null}
 */
function parseUserAgent(userAgent: string | null | undefined): DeviceInfo | null {
  if (!userAgent) return null

  const ua = (uaParserJs as (value: string) => UserAgentParts)(userAgent)
  const deviceInfo: DeviceInfo = {
    browserName: ua?.browser?.name || undefined,
    browserVersion: ua?.browser?.version || undefined,
    osName: ua?.os?.name || undefined,
    osVersion: ua?.os?.version || undefined,
    deviceType: ua?.device?.type || undefined,
    model: ua?.device?.model || undefined,
    vendor: ua?.device?.vendor || undefined
  }

  for (const key of Object.keys(deviceInfo) as Array<keyof DeviceInfo>) {
    if (deviceInfo[key] === undefined) delete deviceInfo[key]
  }

  return Object.keys(deviceInfo).length ? deviceInfo : null
}

export = parseUserAgent
