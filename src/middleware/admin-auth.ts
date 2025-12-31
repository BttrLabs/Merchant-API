import { createMiddleware } from 'hono/factory'
import { ForbiddenError } from '@/errors'
import { timingSafeEqual } from '@/lib/crypto'

type Env = {
  Bindings: {
    ADMIN_API_KEY: string
  }
  Variables: {
    isAdmin: boolean
  }
}

/**
 * Middleware to verify admin API key.
 * Requires X-API-KEY header to match ADMIN_API_KEY environment variable.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export const adminAuth = createMiddleware<Env>(async (c, next) => {
  const apiKey = c.req.header('X-API-KEY')
  const adminKey = c.env.ADMIN_API_KEY

  if (!adminKey) {
    throw new ForbiddenError('Admin authentication not configured')
  }

  if (!apiKey) {
    throw new ForbiddenError('API key required')
  }

  // Use timing-safe comparison to prevent timing attacks
  const isValid = await timingSafeEqual(apiKey, adminKey)
  
  if (!isValid) {
    throw new ForbiddenError('Invalid API key')
  }

  c.set('isAdmin', true)
  await next()
})
