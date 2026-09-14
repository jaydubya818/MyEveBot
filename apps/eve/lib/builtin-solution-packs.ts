import { BUILTIN_ROLE_CATALOG } from "./builtin-role-catalog.ts";
import { FOUNDER_OS_SOLUTION_PACK } from "./role-packs/founder-os.ts";
import { createSolutionPackCatalog } from "./solution-packs.ts";

// Keep this browser-safe. Tests cross-check these IDs against the authoritative
// Capability Registry without pulling server-only runtime state into the UI.
const SOLUTION_PACK_CAPABILITY_IDS = new Set([
  "computer.browser",
  "files.read",
  "files.write",
  "goals.operating-system",
  "web.read",
  "web.search",
]);

export const BUILTIN_SOLUTION_PACKS = [FOUNDER_OS_SOLUTION_PACK] as const;

export const BUILTIN_SOLUTION_PACK_CATALOG = createSolutionPackCatalog(
  BUILTIN_SOLUTION_PACKS,
  BUILTIN_ROLE_CATALOG,
  SOLUTION_PACK_CAPABILITY_IDS,
);
