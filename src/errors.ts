import type { ContentfulStatusCode } from 'hono/utils/http-status'
export class AppError extends Error {
  readonly statusCode: ContentfulStatusCode
  constructor(message: string, statusCode: ContentfulStatusCode = 500) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
  }
}
export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400)
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401)
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403)
  }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(message, 404)
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409)
  }
}
export class UnprocessableError extends AppError {
  constructor(message: string) {
    super(message, 422)
  }
}
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429)
  }
}
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Currently unavailable') {
    super(message, 503)
  }
}