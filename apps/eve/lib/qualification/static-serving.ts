
import { journeyBinding, journeyProfile } from "./journey-profile.ts";
import { derivedRequestBundle, hostBundleSchema, ownerLocalBundleSchema, type QdevHostBundle } from "./host-source.ts";
import { listenLoopback, StaticReleaseController } from "./static-publish.ts";

/**
 * Ordinary serving launch for the installed static release of a QDEV installation: a SERVING-ONLY StaticReleaseController over the profile's private
 * release root (same owner/project/app scope as the publishing controller built by composeRuntimePorts; they share only the durable, append-only state)
 * bound to its verifying handler on the exact IPv4 loopback. It carries no activation permit, so it can never publish or roll back, and it serves the
 * installed release only after re-verifying every file against the manifest. Public TLS, domain, ingress and tester access are separate protected owner
 * actions that map the public origin to this loopback origin; nothing here exposes anything publicly.
 */
export type ServingHandle = { origin: string; handler: (request: Request) => Promise<Response>; close(): Promise<void> };

/**
 * The bundle the serving launcher serves. A frozen (v1) bundle is served as is. A private-beta owner-local (v2) bundle has no project until a request is
 * confirmed, so the operator names the confirmed request text (MYEVE_QDEV_SERVE_REQUEST) and the served project is exactly that request's derivation
 * (the same `derivedRequestBundle` the journey uses). Anything malformed returns null (nothing starts).
 */
export function servingBundleFrom(raw: string, request: string | undefined): QdevHostBundle | null {
  try {
    const json = JSON.parse(raw);
    if (json?.version === 2) return request ? derivedRequestBundle(ownerLocalBundleSchema.parse(json), request).bundle : null;
    return hostBundleSchema.parse(json);
  } catch { return null; }
}

/** Starts the loopback server for the bundle's installed release, or returns null (nothing started) when no assembly profile exists or the bundle expired. */
export async function launchStaticServing(bundle: QdevHostBundle, options: { now?: () => number; host?: string } = {}): Promise<ServingHandle | null> {
  const profile = bundle.assembly;
  if (!profile || Date.parse(bundle.notAfter) <= (options.now?.() ?? Date.now())) return null;
  const controller = new StaticReleaseController({ root: profile.publishing.root, appId: profile.build.appId, installationId: profile.publishing.installationId,
    environment: journeyProfile(bundle.project).environment, ownerId: bundle.ownerId, projectSha256: journeyBinding(bundle.project).projectSha256 });
  const handler = controller.handler();
  const listening = await listenLoopback(handler, { host: options.host, port: profile.publishing.servePort ?? 0 });
  return { origin: listening.origin, handler, close: listening.close };
}
