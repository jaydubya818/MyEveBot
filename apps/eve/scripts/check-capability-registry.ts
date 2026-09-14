import { readdir } from "node:fs/promises";
import path from "node:path";

import { CAPABILITY_DEFINITIONS } from "../lib/capability-registry.ts";

const eveRoot = path.resolve(import.meta.dirname, "..");
const toolDirectory = path.join(eveRoot, "agent", "tools");
const authoredTools = (await readdir(toolDirectory))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => `agent/tools/${name}`)
  .sort();
const registeredTools = CAPABILITY_DEFINITIONS.filter(
  (capability) => capability.kind === "tool" && capability.source.reference?.startsWith("agent/tools/"),
).map((capability) => capability.source.reference!).sort();

const missing = authoredTools.filter((file) => !registeredTools.includes(file));
const stale = registeredTools.filter((file) => !authoredTools.includes(file));
const duplicateIds = CAPABILITY_DEFINITIONS.map((capability) => capability.id).filter(
  (id, index, all) => all.indexOf(id) !== index,
);

if (missing.length > 0) {
  console.error("Authored tools missing capability definitions:");
  missing.forEach((file) => console.error(`  - ${file}`));
}
if (stale.length > 0) {
  console.error("Capability definitions reference missing tools:");
  stale.forEach((file) => console.error(`  - ${file}`));
}
if (duplicateIds.length > 0) {
  console.error(`Duplicate capability ids: ${[...new Set(duplicateIds)].join(", ")}`);
}
if (missing.length > 0 || stale.length > 0 || duplicateIds.length > 0) process.exit(1);

console.log(
  `capability registry ok: ${CAPABILITY_DEFINITIONS.length} definitions, ${authoredTools.length} authored tools`,
);
