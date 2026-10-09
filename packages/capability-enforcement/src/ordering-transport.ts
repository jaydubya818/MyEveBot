import { pendingPolicyDeliveries, acknowledgePolicyFence } from './ordering-source.ts';
import type { AdmissionScope, PolicyConnection } from './postgres.ts';
import type { PolicyKey, SignedPolicyMessage } from './ordering-wire.ts';

type Pool = { connect(): Promise<PolicyConnection & { release(): void }> };
export async function propagateCapabilityPolicy(pool: Pool, scope: AdmissionScope, signer: PolicyKey, relayEndpoint: string) {
  const endpoint = new URL(relayEndpoint);
  if (endpoint.username || endpoint.password || endpoint.hash || endpoint.search
    || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(endpoint.hostname))))
    throw Error('CAPABILITY_ENDPOINT_UNQUALIFIED');
  async function transaction<T>(run: (connection: PolicyConnection) => Promise<T>) {
    const connection = await pool.connect();
    try { await connection.query('BEGIN'); const result = await run(connection); await connection.query('COMMIT'); return result; }
    catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  }
  const pending = await transaction(connection => pendingPolicyDeliveries(connection, scope, signer));
  const results = [];
  for (const item of pending) {
    try {
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envelope: item.envelope }) });
      if (!response.ok || !response.body) throw Error('CAPABILITY_DELIVERY_UNAVAILABLE');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > 32_768) throw Error('CAPABILITY_ACK_TOO_LARGE'); chunks.push(value); }
      } finally { await reader.cancel(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const acknowledgment = JSON.parse(new TextDecoder().decode(bytes)) as SignedPolicyMessage;
      results.push(await transaction(connection => acknowledgePolicyFence(connection, scope, item.backendId, acknowledgment)));
    } catch { results.push({ backendId: item.backendId, status: 'PENDING_PROPAGATION' }); }
  }
  return results;
}
