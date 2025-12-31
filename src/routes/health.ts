import { z, createRoute } from '@hono/zod-openapi'
import { createApp } from '@/lib/create-app'

const app = createApp()

const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string().datetime(),
  version: z.string(),
  uptime: z.number().optional(),
});

const route = createRoute({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  description: 'Returns the current health status of the API. Use this endpoint for monitoring, load balancer health checks, and uptime tracking.',
  tags: ["System"],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthResponseSchema
        },
      },
      description: 'API health status',
    },
  },
})

app.openapi(route, async (c) => {
  return c.json({
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }, 200);
})

export default app;
