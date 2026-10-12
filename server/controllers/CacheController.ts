const CacheManager = require('../managers/CacheManager')
import type { ControllerRequest, ControllerResponse } from '../types/ControllerHttp'

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class CacheController {
  constructor() {}

  /**
   * POST: /api/cache/purge
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async purgeCache(req: ControllerRequest, res: ControllerResponse): Promise<unknown> {
    if (!req.user.isAdminOrUp) {
      return res.sendStatus(403)
    }
    await CacheManager.purgeAll()
    res.sendStatus(200)
  }

  /**
   * POST: /api/cache/items/purge
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async purgeItemsCache(req: ControllerRequest, res: ControllerResponse): Promise<unknown> {
    if (!req.user.isAdminOrUp) {
      return res.sendStatus(403)
    }
    await CacheManager.purgeItems()
    res.sendStatus(200)
  }
}
module.exports = new CacheController()
