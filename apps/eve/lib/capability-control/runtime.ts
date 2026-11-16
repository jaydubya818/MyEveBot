import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { propagateCapabilityPolicy } from '../../../../packages/capability-enforcement/src/ordering-transport.ts';
import { reconcileBackendControls } from '../../../../packages/capability-enforcement/src/lifecycle-transport.ts';
import type { PolicyKey } from '../../../../packages/capability-enforcement/src/ordering-wire.ts';
import pg from 'pg';
import {externalAlphaPolicy,externalAlphaInstallation} from '../external-alpha/policy.ts';
import { hostedProfileFromEnv, type HostedProfile } from '../qualification/hosted-profile.ts';
import { hostedMarkerPresent, hostedOwnerScope } from '../engineering/factory-mailbox.ts';
import {digest} from '../engineering/contract.ts';
import { z } from 'zod';
import { authenticateWebPrincipal } from '../web-auth.ts';
import { CapabilityError, type CapabilityActor } from './contracts.ts';
import { CapabilityStore } from './store.ts';
import { capabilityOwnerId, WITNESS_EXEMPT_OWNER } from './owner-scope.ts';
import { configuredRecoveryWitness, isPostgresRecoveryWitness } from '../../../../packages/capability-enforcement/src/recovery-witness.ts';

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

/**
 * Owner-only recovery-witness exemption (Jay, 2026-11-16 11:55 PT, option A).
 * TODO(https://github.com/jaydubya818/MyEveBot/issues/120): remove once the owner installation has a Postgres recovery witness.
 * The existing owner confirmation signing key authenticates the approved owner installation
 * even when its project and hosted profile settings come from the process environment.
 */
export function witnessExemptOwner(env: NodeJS.ProcessEnv, config: { id: string; environment: string; origin: string }): HostedProfile | null {
  try {
    const owner = WITNESS_EXEMPT_OWNER;
    if (externalAlphaInstallation(env) || env.MYEVE_EXTERNAL_ALPHA_HOSTED_BETA === 'true') return null;
    if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production'
      || (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== 'production')
      || env.VERCEL_PROJECT_ID !== owner.vercelProjectId || config.id !== owner.installationId
      || env.MYEVE_OWNER_ID !== owner.ownerId
      || env.MYEVE_MISSIONCONTROL_MODE !== 'APPROVED_NONPRODUCTION'
      || config.environment !== 'qualification' || config.origin !== owner.origin) return null;
    const profile = hostedProfileFromEnv(env);
    if (!profile || profile.role !== 'OWNER' || profile.installationId !== owner.installationId
      || profile.ownerId !== owner.ownerId || profile.servedOrigin !== owner.origin) return null;
    const pem = env.MYEVE_SOFIE_CONFIRM_KEY;
    if (!pem || pem.length > 4096) return null;
    const key = createPrivateKey(pem.trim().replaceAll('\\n', '\n'));
    if (key.asymmetricKeyType !== 'ed25519') return null;
    const spki = createPublicKey(key).export({ type: 'spki', format: 'der' });
    return createHash('sha256').update(spki).digest('hex') === owner.confirmationKeyId ? profile : null;
  } catch { return null; }
}

export function capabilityConfiguration(env: NodeJS.ProcessEnv = process.env) {
  if (env.MYEVE_CAPABILITY_CONTROL_ENABLED !== 'true')
    throw new CapabilityError('capabilities_unavailable', 'Capability controls require an isolated testing installation.', 503);
  const result = configuration.safeParse({ id: env.MYEVE_CAPABILITY_INSTALLATION_ID,
    environment: env.MYEVE_CAPABILITY_ENVIRONMENT, databaseUrl: env.MYEVE_CAPABILITY_DATABASE_URL,
    origin: env.MYEVE_CAPABILITY_ORIGIN });
  if (!result.success) throw new CapabilityError('capabilities_setup_required', 'Capability controls have not been configured for this installation.', 503);
  const hosted = Boolean(env.VERCEL || env.VERCEL_ENV === 'production' || externalAlphaInstallation(env)
    || (env.NODE_ENV === 'production' && hostedMarkerPresent(env)));
  const exempt = hosted ? witnessExemptOwner(env, result.data) : null;
  if (exempt) console.warn(`[capability] CAPABILITY_WITNESS_EXEMPT_OWNER installation=${exempt.installationId} scope=${hostedOwnerScope(exempt)}: admitted without external-alpha policy or recovery witness (owner-only exemption; remove per MyEveBot#120)`);
  else if (hosted) {
    // A missing or malformed policy (e.g. EXTERNAL_ALPHA_POLICY_REQUIRED on a tester install) is the same refusal: capabilities_unavailable.
    let policy:ReturnType<typeof externalAlphaPolicy>=null;try{policy=externalAlphaPolicy(env);}catch{policy=null;}
    const witness=configuredRecoveryWitness(env);
    if(env.MYEVE_MISSIONCONTROL_MODE!=='APPROVED_NONPRODUCTION'||!policy||result.data.environment!=='qualification'
      ||new URL(result.data.origin).protocol!=='https:'||!witness||!isPostgresRecoveryWitness(witness))
      throw new CapabilityError('capabilities_unavailable','This hosted installation is not qualified.',503);
    const installationDigest=digest({schema:'myeve-hosted-capability-installation/v1',installationId:result.data.id,
      origin:result.data.origin,ownerId:policy.ownerId,projectId:policy.projectId,policyDigest:digest(policy),
      sourceDigest:policy.sourceDigest,factoryVersion:policy.factoryVersion,mode:env.MYEVE_MISSIONCONTROL_MODE});
    if(witness.installationDigest!==installationDigest)
      throw new CapabilityError('capabilities_unavailable','This hosted installation binding is not qualified.',503);
  }
  if (result.data.environment === 'development' && !configuredRecoveryWitness(env))
    throw new CapabilityError('recovery_setup_required', 'This installation requires its independently retained recovery witness.', 503);
  return result.data;
}

export function capabilityStore(signedIn: CapabilityActor): CapabilityStore {
  const config = capabilityConfiguration();
  // Capability rows, commands and policy propagation are keyed on the capability identity (hosted: the per-person scope).
  const actor: CapabilityActor = { ...signedIn, ownerId: capabilityOwnerId(signedIn.ownerId) };
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
