/** Structural subset of Express request/response used by application controllers. */
export interface ControllerUser {
  id?: string
  username?: string
  isRoot?: boolean
  isAdminOrUp?: boolean
  canDelete?: boolean
  canUpdate?: boolean
  getMediaProgress?: (mediaId: string) => { isFinished?: boolean } | null
}

export interface ControllerRequest<TBody extends Record<string, unknown> = Record<string, unknown>> {
  params: Record<string, string>
  query: Record<string, string | undefined>
  body: TBody
  user: ControllerUser
  method?: string
  path?: string
}

export interface ControllerResponse {
  status(code: number): this
  sendStatus(code: number): this
  send(body?: unknown): this
  json(body?: unknown): this
}

export type ControllerNext = () => void
