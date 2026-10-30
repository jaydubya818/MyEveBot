import { FactoryCapabilityClient, type FactoryCapabilityClientConfig } from "../engineering/factory-capability-client.ts";
import { LiveFactoryAdapter, type FactoryConnection } from "../engineering/factory-live-adapter.ts";

/**
 * Constructs the ACTUAL ordered-admission client pair (FactoryCapabilityClient + LiveFactoryAdapter with
 * requireOrderedAdmission) for a Factory connection, and states plainly which connections can compose.
 *
 * At frozen MyFactory 87a9a847 the ordered-admission server contract exists only for the hosted cloud
 * execution (`OrderedFactoryAdmission` accepts parseCloudPrepare shapes over HTTPS, and the capability origin must
 * equal the Factory origin). The local supervisor refuses new preparation outright while capability control is
 * enabled (`assertLocalCapabilityAdmission`), and local V4 original-producer admission is a separate retained
 * record path. So a loopback (local/mac V4) connection cannot be ordered: this refuses with a typed error instead
 * of weakening anything (no unrelated origin, no dropped capability requirement, no unordered fallback).
 */
export class OrderedFactoryClientsRefused extends Error {
  constructor(readonly code: string) { super(code); }
}

export function buildOrderedFactoryClients(input: {
  connection: FactoryConnection; capability: FactoryCapabilityClientConfig;
  factoryFetch?: typeof fetch; capabilityFetch?: typeof fetch;
}): { capability: FactoryCapabilityClient; adapter: LiveFactoryAdapter } {
  if (!("transport" in input.connection)) throw new OrderedFactoryClientsRefused("QDEV_FACTORY_ORDERED_LOCAL_UNSUPPORTED");
  // Same-origin and binding equality are enforced by the existing constructors; they are not relaxed here.
  const capability = new FactoryCapabilityClient(input.capability, input.capabilityFetch ?? fetch);
  const adapter = new LiveFactoryAdapter(input.connection, input.factoryFetch ?? fetch, capability, { requireOrderedAdmission: true });
  return { capability, adapter };
}
