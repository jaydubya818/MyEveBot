// Operator entrypoint for the independent verifier host (run on the separately administered host, never in the app deployment).
//   MYEVE_QDEV_VERIFIER_ENABLED=true MYEVE_QDEV_VERIFIER_PROFILE='<non-secret profile JSON>' <signer PEM env> <database URL env> npx tsx scripts/qdev-verifier-host.ts
// Disabled by default. Listens only on exact IPv4 loopback; prints the loopback origin and profile digest, never a secret. Stops on SIGINT/SIGTERM.
import { startVerifierHost, VerifierHostRefused } from "../lib/qualification/verifier-host.ts";
import { pgExecutionDatabase } from "../lib/qualification/host-source.ts";

try {
  const host = await startVerifierHost({ database: pgExecutionDatabase });
  if (!host) { console.error("verifier host disabled (set MYEVE_QDEV_VERIFIER_ENABLED=true with a complete profile)"); process.exit(2); }
  console.log(JSON.stringify({ listening: host.origin, profileSha256: host.profileSha256 }));
  const stop = () => { void host.close().finally(() => process.exit(0)); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
} catch (error) {
  console.error(error instanceof VerifierHostRefused ? error.code : "QDEV_VERIFIER_HOST_FAILED");
  process.exit(3);
}
