import { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import { AppError } from '@/errors'

export const errorHandler = (err: Error, c: Context) => {
  const requestId = c.get('requestId')
  const event = c.get('event');
  
  if (err instanceof ZodError) {    
    const details = err.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message
    }));
    
    if (event) {
      event.error = {
        type: 'ValidationError',
        message: 'Zod validation failed',
        details: details.map(d => `${d.field}: ${d.message}`),
      };
    }
    
    return c.json({
      error: 'Validation Error',
      details,
      request_id: requestId
    }, 400)
  }
  if (err instanceof AppError) {
    return c.json({
      error: err.message,
      request_id: requestId
    }, err.statusCode)
  }
  if (err instanceof HTTPException) {
    return c.json({
      error: err.message,
      request_id: requestId
    }, err.status)
  }
  
  if (event) {
    event.error = {
      type: 'InternalServerError',
      message: err.message,
      stack: err.stack,
      request_id: requestId,
    };
  }

  return c.json({
    error: 'Internal Server Error',
    request_id: requestId
  }, 500)
}