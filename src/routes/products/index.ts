import { OpenAPIHono } from '@hono/zod-openapi'
import { default as CreateProduct } from "./create-product"
import { default as GetAllProducts } from "./get-all-products"
import { default as GetSingleProduct } from "./get-single-product"
import { default as UpdateProduct } from "./update-product"
import { default as DeleteProduct } from "./delete-product"

const app = new OpenAPIHono().basePath("/products")

app.route("/", GetAllProducts)
app.route("/", GetSingleProduct)
app.route("/", CreateProduct)
app.route("/", UpdateProduct)
app.route("/", DeleteProduct)

export default app
