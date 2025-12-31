import { OpenAPIHono } from '@hono/zod-openapi'
import { default as GetOrders } from "./get-orders"
import { default as GetSingleOrder } from "./get-single-order"
import { default as UpdateOrder } from "./update-order"

const app = new OpenAPIHono().basePath("/orders")

app.route("/", GetOrders)
app.route("/", GetSingleOrder)
app.route("/", UpdateOrder)

export default app
