import { FactoryCapabilityClient, type FactoryCapabilityClientConfig } from "../engineering/factory-capability-client.ts";
import { LiveFactoryAdapter, type FactoryConnection } from "../engineering/factory-live-adapter.ts";

/**
 * Constructs the ACTUAL ordered-admission client pair (FactoryCapabilityClient + LiveFactoryAdapter with
 * requireOrderedAdmission) for a Factory connection. Canonical topology (decision B): local V4 Factory on exact
 * loopback http://127.0.0.1:<port>, with the ordered-admission receiver served by the same local supervisor origin.
 * The hosted cloud V2 connection also composes. Origin equality, binding equality, source/runtime guards and the
 * capability requirement are the existing constructors' and are not relaxed here. The server contract for the
 * local receiver is a protected MyFactory change (see owner package); until it exists every call fails closed.
 */
export class OrderedFactoryClientsRefused extends Error {
  constructor(readonly code: string) { super(code); }
}

export function buildOrderedFactoryClients(input: {
  connection: FactoryConnection; capability: FactoryCapabilityClientConfig;
  factoryFetch?: typeof fetch; capabilityFetch?: typeof fetch;
}): { capability: FactoryCapabilityClient; adapter: LiveFactoryAdapter } {
  // Same-origin and binding equality are enforced by the existing constructors; they are not relaxed here.
  const capability = new FactoryCapabilityClient(input.capability, input.capabilityFetch ?? fetch);
  const adapter = new LiveFactoryAdapter(input.connection, input.factoryFetch ?? fetch, capability, { requireOrderedAdmission: true });
  return { capability, adapter };
}
