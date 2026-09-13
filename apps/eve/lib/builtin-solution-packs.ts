import { BUILTIN_ROLE_CATALOG } from "./builtin-role-catalog.ts";
import { FOUNDER_OS_SOLUTION_PACK } from "./solution-packs/founder-os.ts";
import { createSolutionPackCatalog } from "./solution-packs.ts";

export const BUILTIN_SOLUTION_PACKS = [FOUNDER_OS_SOLUTION_PACK] as const;

// This client-safe allowlist is intentionally narrower than the runtime registry.
// The catalog test cross-checks it against that server-side source of truth.
const BUILTIN_SOLUTION_PACK_CAPABILITY_IDS = new Set([
  "goals.operating-system",
  "notification.review-delivery",
  "scheduler.automations",
]);

export const BUILTIN_SOLUTION_PACK_CATALOG = createSolutionPackCatalog(
  BUILTIN_SOLUTION_PACKS,
  BUILTIN_ROLE_CATALOG,
  BUILTIN_SOLUTION_PACK_CAPABILITY_IDS,
);
