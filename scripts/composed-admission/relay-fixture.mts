/** Disposable service fixture only. No production bindings or external execution. */
import { createServer } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const root = process.env.COMPOSED_RELAY_ROOT!;
if (!root) throw Error('Exact selected Relay source root required');
// Relay's own canonical composed harness uses this public CommonJS bridge.
// Its .ts package has no type:module; ESM namespace destructuring is not its
// named-export contract. Keep the selected source's tsx/tsconfig and dependencies.
const requireRelay = createRequire(resolve(root, 'package.json'));
const load = (file: string) => requireRelay(resolve(root, file));
const { freshDatabase, cleanupDatabase } = await load('tests/helpers.ts');
const { createLocalEd25519Signer } = await load('lib/v2/evidence/index.ts');
const { registerRuntimeClient } = await load('lib/v2/runtime-clients.ts');
const { registerCapabilityDefinition, publishRelaySafetyPolicy } = await load('lib/v2/policy/index.ts');
const { createV2Agent, issueAgentPassport } = await load('lib/v2/passports.ts');
const { createWorkloadBootstrap, exchangeWorkloadBootstrap, revokeLease } = await load('lib/v2/leases.ts');
const { configureV2PlatformBindings } = await load('lib/v2/platform-bindings.ts');
const { advanceRelayPolicyFence, flushRelayPolicyFences, forwardOwnerPolicyFence } = await load('lib/v2/policy/ordering.ts');
const { lockActiveAccount } = await load('lib/account-fence.ts');
const { db, withTransaction } = await load('lib/db.ts');
const { capabilityLeases } = await load('lib/db/schema.ts');
const { POST } = await load('app/api/v2/runtime/capability-leases/route.ts');
const { POST: PREPARE } = await load('app/api/v2/runtime/capability-leases/prepare/route.ts');
for (const fn of [freshDatabase, cleanupDatabase, createLocalEd25519Signer,
    configureV2PlatformBindings, advanceRelayPolicyFence, flushRelayPolicyFences,
    forwardOwnerPolicyFence, POST, PREPARE]) {
    if (typeof fn !== 'function') throw Error('Selected Relay public fixture export contract unavailable');
}
process.on('SIGTERM', async () => { await cleanupDatabase(); process.exit(0); });
try {
    const f = await freshDatabase(), signer = createLocalEd25519Signer('composed-lease');
    const runtime = await registerRuntimeClient({ accountId: f.accountId, actorPrincipalId: f.principalId, displayName: 'Disposable composed fixture', selfDeclaredProduct: 'fixture' }, signer);
    const capabilityName = 'resource.lease.execute';
    await registerCapabilityDefinition({ name: capabilityName, version: '1.0', domain: 'read', description: 'Synthetic offline lease qualification; no resource executor', effectClass: 'read', riskClass: 'low', resourceType: 'target', inputSchema: {}, outputSchema: {}, meteringDimensions: [] }, signer);
    await publishRelaySafetyPolicy({ name: 'composed-safety', rules: [{ id: 'composed-allow', effect: 'ALLOW', match: { capability: { name: capabilityName, version: '1.0' } }, reasonCode: 'ALLOWED_BY_POLICY' }] }, signer);
    const agent = await createV2Agent({ accountId: f.accountId, ownerPrincipalId: f.principalId, name: 'Synthetic owner agent' }, signer);
    await issueAgentPassport({ accountId: f.accountId, agentId: agent.agentId, ownerPrincipalId: f.principalId, policy: { trustTier: 'HIGH_ASSURANCE', capabilityEligibility: [{ name: capabilityName, version: '1.0' }], policyReferences: ['composed-safety'], budgetReferences: [], allowedEnvironments: { providerIds: ['relay-managed'], minimumAssurance: 'managed-equivalent' }, dataAccess: [], expiresAt: new Date(Date.now() + 600000).toISOString() } }, signer);
    const taskId = 'tsk_composed12345678', pair = generateKeyPairSync('ed25519');
    const bootstrap = await createWorkloadBootstrap({ accountId: f.accountId, agentId: agent.agentId, runtimeClientId: runtime.runtimeClientId, taskId, providerId: 'relay-managed', assurance: 'managed-equivalent', audience: 'composed-fixture', publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, signer);
    const workload = await exchangeWorkloadBootstrap({ accountId: f.accountId, secret: bootstrap.secret, proofSignature: sign(null, Buffer.from(bootstrap.challenge), pair.privateKey).toString('base64url') }, signer);
    configureV2PlatformBindings({ signer, keyResolver: { publicKeyForKeyId: async (id: string) => id === signer.keyId ? signer.publicKeyPem() : undefined }, remoteCapabilityPreparation: { resourceResolver: { resolveOwnership: async () => ({ name: 'resource.account_id', value: f.accountId, authoritative: true, observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), sourceRevision: 'synthetic-enrollment:1' }) } } });
    const server = createServer(async (req, res) => {
        try {
            let body = '';
            for await (const chunk of req)
                body += chunk;
            const request = new Request('http://127.0.0.1' + req.url, { method: 'POST', headers: req.headers as any, body });
            const response = await (req.url?.endsWith('/prepare') ? PREPARE : POST)(request);
            const text = await response.text();
            if (req.url?.endsWith('/prepare'))
                console.log('PREPARE ' + text);
            res.writeHead(response.status, Object.fromEntries(response.headers));
            res.end(text);
        }
        catch (error) {
            res.writeHead(500);
            res.end(String(error));
        }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    process.send!({ ready: { ...f, agentId: agent.agentId, runtimeClientId: runtime.runtimeClientId, credential: runtime.secret, taskId, workloadId: workload.workloadId, workloadToken: workload.token, capabilityName, origin: 'http://127.0.0.1:' + ((server.address() as any).port) } });
    process.on('message', async (message: any) => {
        try {
            let result;
            switch (message.operation) {
                case 'configure':
                    process.env.RELAY_V2_ACTIONS_ENABLED = 'true';
                    process.env.RELAY_DEPLOYMENT_MODE = 'local';
                    process.env.RELAY_CAPABILITY_ENVIRONMENT = 'qualification';
                    process.env.RELAY_CAPABILITY_COORDINATION_JSON = JSON.stringify(message.config);
                    await withTransaction(async (tx: any) => { await lockActiveAccount(tx, f.accountId); await advanceRelayPolicyFence(tx, f.accountId); });
                    result = await flushRelayPolicyFences(f.accountId);
                    break;
                case 'fence':
                    result = await forwardOwnerPolicyFence(message.envelope);
                    break;
                case 'leases':
                    result = await db().select().from(capabilityLeases);
                    break;
                case 'revoke':
                    result = await revokeLease({ accountId: f.accountId, leaseId: message.leaseId, reason: 'synthetic owner revoke' }, signer);
                    break;
                case 'close':
                    await new Promise<void>(resolve => server.close(() => resolve()));
                    await cleanupDatabase();
                    await new Promise<void>((resolve, reject) => process.send!({ id: message.id, result: 'CLOSED' }, (error: any) => error ? reject(error) : resolve()));
                    process.exit(0);
                default: throw Error('Unknown fixture operation');
            }
            process.send!({ id: message.id, result });
        }
        catch (error) {
            process.send!({ id: message.id, error: String(error) });
        }
    });
}
catch (error) {
    await cleanupDatabase();
    throw error;
}
