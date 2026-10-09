import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assembleDeployment } from "../../apps/builder/lib/assemble.ts";
import { FEATURE_IDS } from "../../apps/builder/lib/config.ts";

const output = process.env.JEV_QA_GENERATED;
if (!output?.startsWith("/private/tmp/"))
  throw new Error("An isolated output directory is required");
const files = await assembleDeployment({
  projectName: "ava-local-qualification",
  agentName: "Ava",
  instructions:
    "You are Ava, Sarah's personal assistant. Respect her authority.",
  model: "anthropic/claude-sonnet-5",
  features: FEATURE_IDS,
  schedules: [],
});
for (const file of files) {
  const target = resolve(output, file.file);
  if (!target.startsWith(`${resolve(output)}/`))
    throw new Error("Invalid assembly path");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(file.data, "base64"));
}
console.log(
  `Assembled ${files.length} files for Sarah/Ava with no Jev configuration.`,
);
