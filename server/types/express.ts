export interface Request {
  headers?: Record<string, any>
  [key: string]: any
}

export interface Response {
  status(code: number): Response
  send(body?: any): Response
  attachment(filename?: string): Response
  on(event: string, callback: (...args: any[]) => void): Response
  headersSent?: boolean
  pipe?: any
  [key: string]: any
}

export type NextFunction = (err?: any) => void
