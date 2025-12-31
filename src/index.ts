import { Scalar } from '@scalar/hono-api-reference'
import { errorHandler } from '@/middleware/error'
import { eventMiddleware } from '@/middleware/logger'

import { requestId } from 'hono/request-id'

import { ProductsRoute, VariantsRoute, ImagesRoute, CartRoute, InventoryRoute, ReservationsRoute, OrdersRoute, WebhooksRoute, HealthRoute } from "@/routes"

import { createApp } from '@/lib/create-app'

const app = createApp()

app.use(requestId())
app.use(eventMiddleware())
app.onError(errorHandler)

app.get('/', Scalar({ url: '/open-api/generate' }))

app.doc('/open-api/generate', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'BTTR Merchant API',
  },
})

app.route("/v1/", ProductsRoute)
app.route("/v1/", VariantsRoute)
app.route("/v1/", ImagesRoute)
app.route("/v1/", CartRoute)
app.route("/v1/", InventoryRoute)
app.route("/v1/", ReservationsRoute)
app.route("/v1/", OrdersRoute)
app.route("/v1/", WebhooksRoute)
app.route("/v1/", HealthRoute)

export default app
