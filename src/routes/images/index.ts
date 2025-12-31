import { OpenAPIHono } from '@hono/zod-openapi'

import { default as CreateImage } from "./create-image"
import { default as DeleteImage } from "./delete-image"

import { default as GetAllImages } from "./get-all-images"

const app = new OpenAPIHono().basePath("/products")

app.route("/", GetAllImages)
app.route("/", CreateImage)
app.route("/", DeleteImage)

export default app
