import { createHash, randomBytes } from 'crypto'
import type { Database } from 'bun:sqlite'
import type {
  AgentInstance,
  RegisterInstanceRequest,
  ProviderDescriptor,
  InstanceStatus,
} from '@opencode-manager/shared'
import { logger } from '../utils/logger'

interface InstanceRow {
  instance_id: string
  name: string
  base_url: string
  status: string
  provider_kind: string
  provider_id: string
  provider_version: string
  capabilities_json: string
  last_heartbeat_at: number
  created_at: number
  updated_at: number
}

interface InstanceTokenRow {
  token_id: string
  token_hash: string
  status: string
  expires_at: number
}

interface TokenRecord {
  tokenId: string
  token: string
  expiresAt: number
  previousTokenExpiresAt?: number
}

const DEFAULT_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30

function toTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function buildToken(): string {
  return randomBytes(48).toString('base64url')
}

function buildTokenId(): string {
  return randomBytes(16).toString('hex')
}

function toInstance(row: InstanceRow): AgentInstance {
  const capabilities = JSON.parse(row.capabilities_json) as ProviderDescriptor['capabilities']
  return {
    instanceId: row.instance_id,
    name: row.name,
    baseUrl: row.base_url,
    status: row.status as InstanceStatus,
    provider: {
      id: row.provider_id,
      kind: row.provider_kind as ProviderDescriptor['kind'],
      version: row.provider_version,
      capabilities,
    },
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class InstanceService {
  constructor(private readonly db: Database) {}

  registerOrUpdate(request: RegisterInstanceRequest): AgentInstance {
    const now = Date.now()
    const provider = request.provider

    this.db.prepare(`
      INSERT INTO instances (
        instance_id,
        name,
        base_url,
        status,
        provider_kind,
        provider_id,
        provider_version,
        capabilities_json,
        last_heartbeat_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_id) DO UPDATE SET
        name = excluded.name,
        base_url = excluded.base_url,
        status = excluded.status,
        provider_kind = excluded.provider_kind,
        provider_id = excluded.provider_id,
        provider_version = excluded.provider_version,
        capabilities_json = excluded.capabilities_json,
        last_heartbeat_at = excluded.last_heartbeat_at,
        updated_at = excluded.updated_at
    `).run(
      request.instanceId,
      request.name,
      request.baseUrl,
      'online',
      provider.kind,
      provider.id,
      provider.version,
      JSON.stringify(provider.capabilities),
      now,
      now,
      now,
    )

    const instance = this.getById(request.instanceId)
    if (!instance) {
      throw new Error(`Instance ${request.instanceId} not found after register`)
    }

    this.appendAudit(request.instanceId, 'instance.register', true, `provider=${provider.kind}`)
    return instance
  }

  heartbeat(instanceId: string, status: InstanceStatus, provider?: ProviderDescriptor): AgentInstance {
    const now = Date.now()

    if (provider) {
      this.db.prepare(`
        UPDATE instances
        SET status = ?,
            provider_kind = ?,
            provider_id = ?,
            provider_version = ?,
            capabilities_json = ?,
            last_heartbeat_at = ?,
            updated_at = ?
        WHERE instance_id = ?
      `).run(
        status,
        provider.kind,
        provider.id,
        provider.version,
        JSON.stringify(provider.capabilities),
        now,
        now,
        instanceId,
      )
    } else {
      this.db.prepare(`
        UPDATE instances
        SET status = ?,
            last_heartbeat_at = ?,
            updated_at = ?
        WHERE instance_id = ?
      `).run(status, now, now, instanceId)
    }

    const instance = this.getById(instanceId)
    if (!instance) {
      this.appendAudit(instanceId, 'instance.heartbeat', false, 'instance-not-found')
      throw new Error(`Instance ${instanceId} not found`)
    }

    this.appendAudit(instanceId, 'instance.heartbeat', true, `status=${status}`)
    return instance
  }

  rotateToken(instanceId: string, gracePeriodMs: number): TokenRecord {
    const now = Date.now()
    const token = buildToken()
    const tokenId = buildTokenId()
    const expiresAt = now + DEFAULT_TOKEN_TTL_MS
    const tokenHash = toTokenHash(token)

    const currentActive = this.db
      .prepare(`
        SELECT token_id, token_hash, status, expires_at
        FROM instance_tokens
        WHERE instance_id = ? AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(instanceId) as InstanceTokenRow | undefined

    this.db.prepare(`
      INSERT INTO instance_tokens (token_id, instance_id, token_hash, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tokenId, instanceId, tokenHash, 'active', expiresAt, now)

    let previousTokenExpiresAt: number | undefined

    if (currentActive) {
      previousTokenExpiresAt = now + gracePeriodMs
      this.db.prepare(`
        UPDATE instance_tokens
        SET status = 'grace',
            expires_at = ?
        WHERE token_id = ?
      `).run(previousTokenExpiresAt, currentActive.token_id)
    }

    this.appendAudit(instanceId, 'token.rotate', true, `grace=${gracePeriodMs}`)

    return {
      tokenId,
      token,
      expiresAt,
      previousTokenExpiresAt,
    }
  }

  revokeToken(instanceId: string, tokenId: string): boolean {
    const now = Date.now()
    const result = this.db.prepare(`
      UPDATE instance_tokens
      SET status = 'revoked',
          revoked_at = ?
      WHERE instance_id = ? AND token_id = ?
    `).run(now, instanceId, tokenId)

    const success = result.changes > 0
    this.appendAudit(instanceId, 'token.revoke', success, tokenId)
    return success
  }

  authenticate(instanceId: string, token: string): { instanceId: string; tokenId: string } | null {
    const tokenHash = toTokenHash(token)
    const now = Date.now()

    const row = this.db.prepare(`
      SELECT token_id, token_hash, status, expires_at
      FROM instance_tokens
      WHERE instance_id = ? AND token_hash = ?
      LIMIT 1
    `).get(instanceId, tokenHash) as InstanceTokenRow | undefined

    if (!row) {
      this.appendAudit(instanceId, 'token.auth', false, 'token-not-found')
      return null
    }

    if ((row.status !== 'active' && row.status !== 'grace') || row.expires_at <= now) {
      this.appendAudit(instanceId, 'token.auth', false, `status=${row.status}`)
      return null
    }

    return {
      instanceId,
      tokenId: row.token_id,
    }
  }

  listInstances(): AgentInstance[] {
    const rows = this.db.prepare(`
      SELECT
        instance_id,
        name,
        base_url,
        status,
        provider_kind,
        provider_id,
        provider_version,
        capabilities_json,
        last_heartbeat_at,
        created_at,
        updated_at
      FROM instances
      ORDER BY updated_at DESC
    `).all() as InstanceRow[]

    return rows.map(toInstance)
  }

  getById(instanceId: string): AgentInstance | null {
    const row = this.db.prepare(`
      SELECT
        instance_id,
        name,
        base_url,
        status,
        provider_kind,
        provider_id,
        provider_version,
        capabilities_json,
        last_heartbeat_at,
        created_at,
        updated_at
      FROM instances
      WHERE instance_id = ?
      LIMIT 1
    `).get(instanceId) as InstanceRow | undefined

    return row ? toInstance(row) : null
  }

  getBaseUrl(instanceId: string): string | null {
    const row = this.db.prepare('SELECT base_url FROM instances WHERE instance_id = ? LIMIT 1').get(instanceId) as { base_url: string } | undefined
    return row?.base_url ?? null
  }

  canSessionAccessInstance(sessionId: string, instanceId: string, isAdmin: boolean): boolean {
    if (isAdmin) {
      return true
    }

    try {
      const row = this.db.prepare('SELECT instance_id FROM "session" WHERE id = ? LIMIT 1').get(sessionId) as { instance_id: string | null } | undefined
      return row?.instance_id === instanceId
    } catch (error) {
      logger.error('Failed to validate session instance access', error)
      return false
    }
  }

  private appendAudit(instanceId: string, action: string, success: boolean, detail?: string): void {
    try {
      this.db.prepare(`
        INSERT INTO instance_audit_logs (instance_id, action, success, detail, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(instanceId, action, success ? 1 : 0, detail ?? null, Date.now())
    } catch (error) {
      logger.error('Failed to write instance audit log', error)
    }
  }
}
