import {describe, expect, it} from 'vitest';
import {CURRENT_DATABASE_MIGRATION, requiredDatabaseMigration} from './database-schema';
import {loadMigrations} from '../scripts/migration-runner.ts';

describe('explicit schema rollout', () => {
  it('preserves existing personal installation requirements', () => {
    expect(requiredDatabaseMigration({NODE_ENV: 'production'})).toBe('0082_factory_concrete_grant_binding.sql');
    expect(requiredDatabaseMigration({NODE_ENV: 'production', MYEVE_DURABLE_WEB_SESSIONS: 'true'})).toBe('0083_web_session_revocations.sql');
  });
  it('requires the newest reviewed schema only for the configured external alpha installation', async () => {
    expect(requiredDatabaseMigration({NODE_ENV: 'production', MYEVE_ALPHA_OWNER_BINDING: '{}'})).toBe('0084_three_owner_cloud_accounting.sql');
    expect(CURRENT_DATABASE_MIGRATION).toBe((await loadMigrations()).at(-1)?.name);
    expect(requiredDatabaseMigration({NODE_ENV:'production',MYEVE_EXTERNAL_ALPHA_POLICY:'{}'})).toBe(CURRENT_DATABASE_MIGRATION);
  });
});
