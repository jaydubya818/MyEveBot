/**
 * Serving-only launcher for the installed QDEV static release (loopback). Reads the same non-secret host bundle as the installation
 * (MYEVE_QDEV_HOST_BUNDLE), requires MYEVE_QDEV_ENABLED=true, and exits nonzero without starting anything when the bundle is absent, malformed, expired
 * or carries no assembly profile. It holds no credential or activation permit and never publishes. Public exposure is a separate protected owner action.
 * A private-beta owner-local (version 2) bundle is served for exactly one confirmed request, named by MYEVE_QDEV_SERVE_REQUEST.
 * Run: MYEVE_QDEV_ENABLED=true MYEVE_QDEV_HOST_BUNDLE=... [MYEVE_QDEV_SERVE_REQUEST="<confirmed request>"] node --import tsx scripts/qdev-serve-static.ts
 */
import { launchStaticServing, servingBundleFrom } from "../lib/qualification/static-serving.ts";

const raw = process.env.MYEVE_QDEV_HOST_BUNDLE;
if (process.env.MYEVE_QDEV_ENABLED !== "true" || !raw || raw.length > 100_000) { console.error("QDEV_SERVING_DISABLED"); process.exit(2); }
const bundle = servingBundleFrom(raw, process.env.MYEVE_QDEV_SERVE_REQUEST);
if (!bundle) { console.error("QDEV_SERVING_BUNDLE"); process.exit(2); }
const handle = await launchStaticServing(bundle);
if (!handle) { console.error("QDEV_SERVING_NOT_CONFIGURED"); process.exit(2); }
console.log(JSON.stringify({ origin: handle.origin }));
const stop = () => { void handle.close().finally(() => process.exit(0)); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
