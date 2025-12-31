import { OpenAPIHono } from '@hono/zod-openapi'
import { default as StripeWebhook } from "./stripe"

const app = new OpenAPIHono().basePath("/webhooks/stripe")

app.route("/", StripeWebhook)

export default app
