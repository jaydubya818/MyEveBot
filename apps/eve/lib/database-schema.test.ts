import {describe, expect, it} from 'vitest';
import {CURRENT_DATABASE_MIGRATION, requiredDatabaseMigration} from './database-schema';

describe('explicit schema rollout', () => {
  it('preserves existing personal installation requirements', () => {
    expect(requiredDatabaseMigration({NODE_ENV: 'production'})).toBe('0082_factory_concrete_grant_binding.sql');
    expect(requiredDatabaseMigration({NODE_ENV: 'production', MYEVE_DURABLE_WEB_SESSIONS: 'true'})).toBe('0083_web_session_revocations.sql');
  });
  it('requires the new accounting schema only for the configured alpha installation', () => {
    expect(requiredDatabaseMigration({NODE_ENV: 'production', MYEVE_ALPHA_OWNER_BINDING: '{}'})).toBe(CURRENT_DATABASE_MIGRATION);
    expect(CURRENT_DATABASE_MIGRATION).toBe('0084_three_owner_cloud_accounting.sql');
  });
});
