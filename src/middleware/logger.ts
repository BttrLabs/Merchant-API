import { Context } from 'hono'
import pino from 'pino'

type EventError = {
  type: string
  message?: string
  code?: string | number
  retriable?: boolean
  [key: string]: unknown
}

export type Event = {
  request_id?: string
  timestamp: string
  method: string
  path: string
  service?: string
  version?: string
  deployment_id?: string
  region?: string
  status_code?: number
  outcome?: 'success' | 'error'
  duration_ms?: number
  error?: EventError
  [key: string]: unknown
}


const logger = pino({ level: 'info' })

export function eventMiddleware() {
  return async (c: Context, next: () => Promise<void>) => {
    const startTime = Date.now()

    const event: Event = {
      request_id: c.get('requestId'),
      timestamp: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      service: c.env.SERVICE_NAME,
      version: c.env.SERVICE_VERSION,
    }

    c.set('event', event)

    try {
      await next()
      event.status_code = c.res.status
      event.outcome = 'success'
    } catch (err: unknown) {
      const e = err as {
        name?: string
        message?: string
        code?: string | number
        retriable?: boolean
      }

      event.status_code = 500
      event.outcome = 'error'
      event.error = {
        type: e.name ?? 'Error',
        message: e.message ?? 'Unknown error',
        code: e.code,
        retriable: e.retriable ?? false,
      }

      throw err
    } finally {
      event.duration_ms = Date.now() - startTime
      logger.info(event)
    }
  }
}
