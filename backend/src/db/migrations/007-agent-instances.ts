import type { Migration } from '../migration-runner'

const migration: Migration = {
  version: 7,
  name: 'agent-instances',

  up(db) {
    db.run(`
      CREATE TABLE IF NOT EXISTS instances (
        instance_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_kind TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_version TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        last_heartbeat_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS instance_tokens (
        token_id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL REFERENCES instances(instance_id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS instance_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id TEXT NOT NULL,
        action TEXT NOT NULL,
        success INTEGER NOT NULL,
        detail TEXT,
        created_at INTEGER NOT NULL
      )
    `)

    db.run('CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status)')
    db.run('CREATE INDEX IF NOT EXISTS idx_instances_provider_kind ON instances(provider_kind)')
    db.run('CREATE INDEX IF NOT EXISTS idx_instance_tokens_instance_id ON instance_tokens(instance_id)')
    db.run('CREATE INDEX IF NOT EXISTS idx_instance_tokens_status ON instance_tokens(status)')
    db.run('CREATE INDEX IF NOT EXISTS idx_instance_tokens_expires_at ON instance_tokens(expires_at)')
    db.run('CREATE INDEX IF NOT EXISTS idx_instance_audit_instance_id ON instance_audit_logs(instance_id)')
    db.run('CREATE INDEX IF NOT EXISTS idx_instance_audit_created_at ON instance_audit_logs(created_at)')

    const sessionTableColumns = db.prepare('PRAGMA table_info("session")').all() as Array<{ name: string }>
    const hasInstanceId = sessionTableColumns.some((column) => column.name === 'instance_id')

    if (!hasInstanceId) {
      db.run('ALTER TABLE "session" ADD COLUMN instance_id TEXT')
    }

    db.run('CREATE INDEX IF NOT EXISTS idx_session_instance_id ON "session"(instance_id)')
  },

  down(db) {
    db.run('DROP INDEX IF EXISTS idx_session_instance_id')
    db.run('DROP INDEX IF EXISTS idx_instance_audit_created_at')
    db.run('DROP INDEX IF EXISTS idx_instance_audit_instance_id')
    db.run('DROP INDEX IF EXISTS idx_instance_tokens_expires_at')
    db.run('DROP INDEX IF EXISTS idx_instance_tokens_status')
    db.run('DROP INDEX IF EXISTS idx_instance_tokens_instance_id')
    db.run('DROP INDEX IF EXISTS idx_instances_provider_kind')
    db.run('DROP INDEX IF EXISTS idx_instances_status')
    db.run('DROP TABLE IF EXISTS instance_audit_logs')
    db.run('DROP TABLE IF EXISTS instance_tokens')
    db.run('DROP TABLE IF EXISTS instances')
  },
}

export default migration
