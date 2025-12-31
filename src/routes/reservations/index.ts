import { OpenAPIHono } from '@hono/zod-openapi'
import { default as GetReservations } from "./get-reservations"
import { default as GetSingleReservation } from "./get-single-reservation"
import { default as DeleteReservation } from "./delete-reservation"

const app = new OpenAPIHono().basePath("/reservations")

app.route("/", GetReservations)
app.route("/", GetSingleReservation)
app.route("/", DeleteReservation)

export default app
