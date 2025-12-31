import { OpenAPIHono } from '@hono/zod-openapi'
import { Event } from "@/middleware/logger"

type Bindings = {
  DATABASE_URL: string
  SERVICE_NAME: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  FRONTEND_URL: string
  ADMIN_API_KEY: string
  ENCRYPTION_KEY: string
}

type Variables = {
  event: Event
  isAdmin?: boolean
}

export function createApp() {
  return new OpenAPIHono<{
    Bindings: Bindings
    Variables: Variables
  }>({
    defaultHook: (result, c) => {
      if (!result.success) {
        throw result.error
      }
    }
  })
}
