import { Hono } from 'hono'
import { z } from 'zod'
import {
  InstanceHeartbeatRequestSchema,
  RegisterInstanceRequestSchema,
  RevokeInstanceTokenRequestSchema,
  RotateInstanceTokenRequestSchema,
} from '@opencode-manager/shared'
import { InstanceService } from '../services/instances'

function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null
  }

  const [scheme, token] = headerValue.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token
}

export function createInstanceRoutes(instanceService: InstanceService): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const instances = instanceService.listInstances()
    return c.json({ instances })
  })

  app.get('/:instanceId', (c) => {
    const instanceId = c.req.param('instanceId')
    const instance = instanceService.getById(instanceId)

    if (!instance) {
      return c.json({ error: 'Instance not found' }, 404)
    }

    return c.json({ instance })
  })

  app.post('/:instanceId/tokens/bootstrap', async (c) => {
    const instanceId = c.req.param('instanceId')

    try {
      const body = await c.req.json().catch(() => ({}))
      const validated = RotateInstanceTokenRequestSchema.parse(body)
      const tokenRecord = instanceService.rotateToken(instanceId, validated.gracePeriodMs)
      return c.json({
        success: true,
        tokenId: tokenRecord.tokenId,
        token: tokenRecord.token,
        expiresAt: tokenRecord.expiresAt,
        previousTokenExpiresAt: tokenRecord.previousTokenExpiresAt,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid request body', details: error.issues }, 400)
      }

      return c.json({ error: error instanceof Error ? error.message : 'Failed to bootstrap token' }, 500)
    }
  })

  return app
}

export function createAgentInstanceRoutes(instanceService: InstanceService): Hono {
  const app = new Hono<{
    Variables: {
      instanceId: string
      tokenId: string
    }
  }>()

  app.use('/*', async (c, next) => {
    const instanceId = c.req.header('x-instance-id')
    const token = extractBearerToken(c.req.header('authorization'))

    if (!instanceId || !token) {
      return c.json({ error: 'Missing instance auth headers' }, 401)
    }

    const authContext = instanceService.authenticate(instanceId, token)
    if (!authContext) {
      return c.json({ error: 'Invalid instance token' }, 401)
    }

    c.set('instanceId', authContext.instanceId)
    c.set('tokenId', authContext.tokenId)
    await next()
  })

  app.post('/register', async (c) => {
    try {
      const body = await c.req.json()
      const validated = RegisterInstanceRequestSchema.parse(body)
      const authInstanceId = c.get('instanceId')

      if (validated.instanceId !== authInstanceId) {
        return c.json({ error: 'Instance mismatch' }, 403)
      }

      const instance = instanceService.registerOrUpdate(validated)
      return c.json({ success: true, instance })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid request body', details: error.issues }, 400)
      }

      return c.json({ error: error instanceof Error ? error.message : 'Failed to register instance' }, 500)
    }
  })

  app.post('/heartbeat', async (c) => {
    try {
      const body = await c.req.json()
      const validated = InstanceHeartbeatRequestSchema.parse(body)
      const instance = instanceService.heartbeat(c.get('instanceId'), validated.status, validated.provider)
      return c.json({ success: true, instance })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid request body', details: error.issues }, 400)
      }

      return c.json({ error: error instanceof Error ? error.message : 'Failed to process heartbeat' }, 500)
    }
  })

  app.post('/tokens/rotate', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const validated = RotateInstanceTokenRequestSchema.parse(body)
      const tokenRecord = instanceService.rotateToken(c.get('instanceId'), validated.gracePeriodMs)

      return c.json({
        success: true,
        tokenId: tokenRecord.tokenId,
        token: tokenRecord.token,
        expiresAt: tokenRecord.expiresAt,
        previousTokenExpiresAt: tokenRecord.previousTokenExpiresAt,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid request body', details: error.issues }, 400)
      }

      return c.json({ error: error instanceof Error ? error.message : 'Failed to rotate token' }, 500)
    }
  })

  app.post('/tokens/revoke', async (c) => {
    try {
      const body = await c.req.json()
      const validated = RevokeInstanceTokenRequestSchema.parse(body)
      const success = instanceService.revokeToken(c.get('instanceId'), validated.tokenId)
      return c.json({ success })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid request body', details: error.issues }, 400)
      }

      return c.json({ error: error instanceof Error ? error.message : 'Failed to revoke token' }, 500)
    }
  })

  return app
}
