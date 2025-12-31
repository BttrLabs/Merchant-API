import { OpenAPIHono } from '@hono/zod-openapi'

import { default as CreateVariant } from "./create-variant"
import { default as DeleteVariant } from "./delete-variant"
import { default as GetVariant } from "./get-variant"
import { default as UpdateVariant } from "./update-variant"

import { default as GetAllVariants } from "./get-all-variants"

const app = new OpenAPIHono().basePath("/products")

app.route("/", CreateVariant)
app.route("/", DeleteVariant)
app.route("/", GetVariant)
app.route("/", UpdateVariant)
app.route("/", GetAllVariants)

export default app
