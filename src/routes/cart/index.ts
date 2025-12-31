import { OpenAPIHono } from '@hono/zod-openapi'

import { default as CreateCart } from "./create-cart"
import { default as GetCart } from "./get-cart"
import { default as AddItem } from "./add-item"
import { default as RemoveItem } from "./remove-item"
import { default as Checkout } from "./checkout"

const app = new OpenAPIHono().basePath("/cart")

app.route("/", CreateCart)
app.route("/", GetCart)
app.route("/", AddItem)
app.route("/", RemoveItem)
app.route("/", Checkout)

export default app
