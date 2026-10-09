import { propagateCapabilityPolicy } from '../../../../packages/capability-enforcement/src/ordering-transport.ts';
import { reconcileBackendControls } from '../../../../packages/capability-enforcement/src/lifecycle-transport.ts';
import type { PolicyKey } from '../../../../packages/capability-enforcement/src/ordering-wire.ts';
import pg from 'pg';
import { z } from 'zod';
import { authenticateWebPrincipal } from '../web-auth.ts';
import { CapabilityError, type CapabilityActor } from './contracts.ts';
import { CapabilityStore } from './store.ts';
import { configuredRecoveryWitness } from '../../../../packages/capability-enforcement/src/recovery-witness.ts';

const configuration = z.object({
  id: z.string().min(1).max(200),
  environment: z.enum(['development', 'qualification']),
  databaseUrl: z.string().min(1),
  origin: z.string().url().refine(value => {
    const url = new URL(value);
    return url.origin === value && (url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  }),
});
let pool: pg.Pool | undefined;

export function capabilityConfiguration(env: NodeJS.ProcessEnv = process.env) {
  if (env.MYEVE_CAPABILITY_CONTROL_ENABLED !== 'true' || env.VERCEL || env.VERCEL_ENV === 'production')
    throw new CapabilityError('capabilities_unavailable', 'Capability controls require an isolated testing installation.', 503);
  const result = configuration.safeParse({ id: env.MYEVE_CAPABILITY_INSTALLATION_ID,
    environment: env.MYEVE_CAPABILITY_ENVIRONMENT, databaseUrl: env.MYEVE_CAPABILITY_DATABASE_URL,
    origin: env.MYEVE_CAPABILITY_ORIGIN });
  if (!result.success) throw new CapabilityError('capabilities_setup_required', 'Capability controls have not been configured for this installation.', 503);
  if (result.data.environment === 'development' && !configuredRecoveryWitness(env))
    throw new CapabilityError('recovery_setup_required', 'This installation requires its independently retained recovery witness.', 503);
  return result.data;
}

export function capabilityStore(actor: CapabilityActor): CapabilityStore {
  const config = capabilityConfiguration();
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4, connectionTimeoutMillis: 5000,
      statement_timeout: 5000, idle_in_transaction_session_timeout: 5000 });
    pool.on('error', () => { console.error('Capability database idle connection failed.'); });
  }
  const delivery = process.env.MYEVE_CAPABILITY_PROPAGATION_JSON;
  const transport = delivery ? JSON.parse(delivery) as { signer: PolicyKey; relayEndpoint: string; lifecycleEndpoints?: Record<string, string> } : undefined;
  return new CapabilityStore(pool, config, actor, transport ? async organizationId => {
    const scope = { ownerId: actor.ownerId, installationId: config.id, organizationId,
      environment: config.environment, agentId: 'policy-propagation' } as const;
    await propagateCapabilityPolicy(pool!, scope, transport.signer, transport.relayEndpoint);
    if (transport.lifecycleEndpoints) await reconcileBackendControls(pool!, scope, transport.lifecycleEndpoints, transport.signer);
  } : undefined);
}

export async function capabilityPrincipal(request: Request) {
  const config = capabilityConfiguration();
  const principal = await authenticateWebPrincipal(request, { ...process.env, NODE_ENV: 'production' });
  if (!principal) throw new CapabilityError('authentication_required', 'Sign in to manage capabilities.', 401);
  if (request.method !== 'GET' && (request.headers.get('origin') !== config.origin
    || request.headers.get('sec-fetch-site') === 'cross-site'))
    throw new CapabilityError('same_origin_required', 'Use a same-origin capability request.', 403);
  return principal.id;
}

/** Drain the isolated service pool during process shutdown or qualification cleanup. */
export async function closeCapabilityDatabase() {
  const current = pool; pool = undefined;
  await current?.end();
}
