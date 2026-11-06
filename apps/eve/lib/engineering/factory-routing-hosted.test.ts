/**
 * P1 regression (review EVE-REVIEW-1): hosted Work routing qualifies exactly the hosted per-person scope `myeve.hosted:<installation>:<owner>`
 * (never weaker: no other scope, no foreign owner, no non-mailbox transport) and probes Factory health only through the mailbox.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { digest } from './contract.ts';
import { HOSTED_PROFILE, hostedOwnerScope, mailboxFetch, type MailboxDb } from './factory-mailbox.ts';
import { factoryTransportFetch } from './factory-transport.ts';
import { FactoryRouteAuthority } from './factory-routing.ts';

const ORIGIN = 'http://127.0.0.1:8792', h = (c: string) => c.repeat(64), sourceDigest = h('1'), configurationDigest = h('2');
const binding = { installationId: 'prj_hosted_owner', ownerId: 'jay' };
const connection = { origin: ORIGIN, token: h('a'), factoryId: 'f', sourceDigest, configurationDigest, factoryVersion: digest({ sourceDigest, configurationDigest }),
  repositoryPath: '/tmp/repo', keys: [{ factoryId: 'f', keyId: 'k', publicKey: 'pem', activeFrom: '2026-01-01T00:00:00Z', notAfter: '2099-01-01T00:00:00Z' }],
  spendContract: { version: 'WORK_LEDGER_V2', sourceDigest },
  qualification: { scopeId: hostedOwnerScope(binding), profileHash: h('3'), evidenceRef: 'ev', qualifiedAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', mode: 'LIVE', spendEnforced: true } } as never;
const work = { scopeId: 'jay' } as never;
type Internals = { qualificationScope(work: unknown): string | null; factoryHealthy(connection: unknown): Promise<boolean> };
const internals = (a: FactoryRouteAuthority) => a as unknown as Internals;
const healthyBody = { controls: ['factory.prepare', 'factory.dispatch', 'factory.observe', 'factory.stop'], execution: { mode: 'LIVE', spendEnforced: true } };

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('hosted Factory routing', () => {
  it('qualifies exactly the installation per-person scope for its own owner; nothing broader', () => {
    const db = { query: async () => [] } as MailboxDb, viaMailbox = mailboxFetch(db, binding, 'factory', ORIGIN);
    const hosted = internals(new FactoryRouteAuthority({} as never, async () => ({}) as never, { binding, factoryFetch: viaMailbox }));
    expect(hosted.qualificationScope(work)).toBe('myeve.hosted:prj_hosted_owner:jay');
    expect(hosted.qualificationScope({ scopeId: 'tester' })).toBeNull();                      // foreign owner
    const direct = internals(new FactoryRouteAuthority({} as never, async () => ({}) as never, { binding, factoryFetch: fetch }));
    expect(direct.qualificationScope(work)).toBeNull();                                         // a non-mailbox transport never qualifies
    // Owner-local (no hosted marker, no hosted option): unchanged, the Work's own scope.
    expect(internals(new FactoryRouteAuthority({} as never)).qualificationScope(work)).toBe('jay');
    // A hosted marker without the hosted routing option fails closed.
    vi.stubEnv('MYEVE_HOSTED_PROFILE', '{"malformed":true}');
    expect(internals(new FactoryRouteAuthority({} as never)).qualificationScope(work)).toBeNull();
  });

  it('health goes through the mailbox only; a hosted process never probes the loopback host directly', async () => {
    const direct = vi.fn(async () => Response.json(healthyBody));
    vi.stubGlobal('fetch', direct);
    vi.stubEnv('MYEVE_HOSTED_PROFILE', '{}');
    expect(await internals(new FactoryRouteAuthority({} as never)).factoryHealthy(connection)).toBe(false);
    expect(direct).not.toHaveBeenCalled();
    // Through the mailbox (fake mailbox db answering like the Mac poller would): healthy.
    const sent: string[] = [];
    const db: MailboxDb = { query: async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('WITH poller')) { sent.push(String(params?.[6])); return [{ id: params?.[0] }]; }
      if (sql.includes("state='ANSWERED'") && sql.startsWith('DELETE')) {
        const body = Buffer.from(JSON.stringify(healthyBody));
        return [{ response_status: 200, response_headers: { 'content-type': 'application/json' }, response_body_sha256: (await import('node:crypto')).createHash('sha256').update(body).digest('hex'), response_body_base64: body.toString('base64') }];
      }
      return [];
    } };
    const factoryFetch = factoryTransportFetch(connection as never, { kind: 'mailbox', profile: HOSTED_PROFILE, db, binding });
    expect(await internals(new FactoryRouteAuthority({} as never, async () => ({}) as never, { binding, factoryFetch })).factoryHealthy(connection)).toBe(true);
    expect(sent).toEqual(['/api/connect/v1/actions']);
    expect(direct).not.toHaveBeenCalled();
  });
});
