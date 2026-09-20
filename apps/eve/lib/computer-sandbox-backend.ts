import { AsyncLocalStorage } from "node:async_hooks";
import { vercel } from "eve/sandbox/vercel";
import { consumeProviderAuthority, type AuthorizedAction } from "./action-gateway.ts";
import type { Preparation } from "./computer-template-lifecycle.ts";
import { preparationResourceName, computerProviderCredentials } from "./computer-template-vercel.ts";

const grants = new AsyncLocalStorage<{ preparation: Preparation; consumed: boolean }>();
export class ComputerSandboxAuthorityRequired extends Error {
  constructor() { super("Computer session creation requires current Action Gateway authority."); this.name = "ComputerSandboxAuthorityRequired"; }
}

/** Called only by the Computer Action Gateway adapter after its second authority check. */
export async function withPreparedComputer<T>(preparation: Preparation, authority: AuthorizedAction, parameters: Record<string, unknown>, work: () => Promise<T>): Promise<T> {
  await consumeProviderAuthority(authority, parameters, "computer.session.create");
  return grants.run({ preparation, consumed: false }, work);
}

export const computerSandboxBackend: ReturnType<typeof vercel> = {
  name: "myeve-computer-v1",
  // Build/discovery is pure. Runtime preparation is an explicit authorized operation.
  async prewarm() { return { reused: false }; },
  async create(input) {
    const grant = grants.getStore();
    if (!grant || grant.consumed || grant.preparation.state !== "READY") throw new ComputerSandboxAuthorityRequired();
    grant.consumed = true;
    const backend = vercel({ ...computerProviderCredentials(), resources: { vcpus: 2 }, networkPolicy: "deny-all" });
    const handle = await backend.create({ ...input, templateKey: preparationResourceName(grant.preparation) });
    return { ...handle, async captureState() { return { ...await handle.captureState(), backendName: "myeve-computer-v1" }; } };
  },
};
