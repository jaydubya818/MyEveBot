import type { AdmissionScope, PolicyConnection } from './postgres.ts';
import { acknowledgeBackendControl, pendingLifecycleDeliveries } from './lifecycle-source.ts';
import type { PolicyKey } from './ordering-wire.ts';
import type { SignedLifecycleReceipt } from './lifecycle-wire.ts';

type Pool = { connect(): Promise<PolicyConnection & { release(): void }> };
/** Endpoints come from installation configuration, never owner commands or receipt bodies. */
export async function reconcileBackendControls(pool: Pool, scope: AdmissionScope, endpoints: Record<string, string>, signer: PolicyKey) {
  async function transaction<T>(run: (connection: PolicyConnection) => Promise<T>) {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      await connection.query("SELECT set_config('myeve.capability_owner',$1,true),set_config('myeve.capability_installation',$2,true)", [scope.ownerId, scope.installationId]);
      const result = await run(connection); await connection.query('COMMIT'); return result;
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  }
  const deliveries = await transaction(connection => pendingLifecycleDeliveries(connection, scope, signer));
  const results = [];
  for (const delivery of deliveries) {
    const backendId = delivery.backendId;
    try {
      const address = endpoints[backendId];
      if (!address) throw Error('CAPABILITY_LIFECYCLE_UNCONFIGURED');
      const endpoint = new URL(address);
      if (endpoint.username || endpoint.password || endpoint.hash || endpoint.search
        || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(endpoint.hostname))))
        throw Error('CAPABILITY_ENDPOINT_UNQUALIFIED');
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envelope: delivery.envelope }) });
      if (!response.ok || !response.body) throw Error('CAPABILITY_LIFECYCLE_UNAVAILABLE');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > 32_768) throw Error('CAPABILITY_LIFECYCLE_TOO_LARGE'); chunks.push(value); }
      } finally { await reader.cancel(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const envelope = JSON.parse(new TextDecoder().decode(bytes)) as SignedLifecycleReceipt;
      const receipt = await transaction(connection => acknowledgeBackendControl(connection, scope, backendId, envelope));
      results.push({ backendId, state: receipt.state });
    } catch { results.push({ backendId, state: 'PENDING_BACKEND' }); }
  }
  return results;
}
