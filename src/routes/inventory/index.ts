import { OpenAPIHono } from '@hono/zod-openapi'
import { default as GetInventory } from "./get-inventory"
import { default as GetSingleInventory } from "./get-single-inventory"
import { default as CreateInventory } from "./create-inventory"
import { default as UpdateInventory } from "./update-inventory"

const app = new OpenAPIHono().basePath("/inventory")

app.route("/", GetInventory)
app.route("/", GetSingleInventory)
app.route("/", CreateInventory)
app.route("/", UpdateInventory)

export default app
