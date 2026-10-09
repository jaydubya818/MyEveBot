// Isolated UI fixture: actual management component, synthetic metadata, no app server/providers.
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const root = path.resolve(import.meta.dirname, ".."),
  require = createRequire(path.join(root, "package.json"));
const { build } = require("esbuild");
const directory = await mkdtemp(path.join(tmpdir(), "myeve-admission-ui-"));
const states = [
  "READY",
  "NEEDS_CONFIGURATION",
  "NEEDS_APPROVAL",
  "BLOCKED",
  "AUTO_PAUSED",
  "DISABLED",
];
const messages = [
  "All required capabilities are available.",
  "An authenticated email account is required before this Routine can run.",
  "Review this Routine’s capabilities.",
  "Phone execution has not been qualified.",
  "Paused after repeated execution failures.",
  "This Routine is disabled.",
];
const routines = states.map((state, index) => ({
  id: index + 1,
  routine_name: [
    "Daily Brief",
    "Customer Follow-Up",
    "Weekly Review",
    "Phone Follow-Up",
    "Campaign Review",
    "Archived Draft",
  ][index],
  prompt: "Prepare owner-reviewable work.",
  cron: "0 8 * * 1-5",
  timezone: "America/Los_Angeles",
  next_fire_at: "2026-09-21T15:00:00Z",
  configuration_version: 1,
  reviewed_version: 1,
  execution_status: "active",
  execution_routine_id: `routine-${index}`,
  routine_version: 1,
  agent_id: "ava",
  configuration: {
    authority: {
      allowedCapabilities: [],
      allowedTargets: [],
      requiresApprovalFor: [],
      maximumRisk: "low",
    },
    limits: { maxCostUsd: 1, maxSteps: 20 },
  },
  readiness: {
    state,
    version: 1,
    canRun: false,
    executionEnabled: false,
    issues:
      state === "READY" ? [] : [{ code: "fixture", message: messages[index] }],
    capabilities: [
      {
        id: "tool.list_goals",
        name: "Read Goals and Tasks",
        required: true,
        permission: "ALLOW",
        availability: {
          status: state === "READY" ? "AVAILABLE" : "UNAVAILABLE",
        },
      },
      {
        id: "notification.send",
        name: "Owner notification",
        required: false,
        permission: "ALLOW",
        availability: { status: "UNAVAILABLE" },
      },
    ],
  },
}));
const source = `import React from 'react';import {createRoot} from 'react-dom/client';import {RoutinesPanel} from ${JSON.stringify(path.join(root, "components/routines-panel.tsx"))};
const data=${JSON.stringify({ executionReady: false, routines, agents: [{ id: "ava", name: "Ava", status: "active", limits: { maxSteps: 30, maxRuntimeSeconds: 600, maxEstimatedCostUsd: 1 } }], capabilities: [] })};
window.fetch=async(input,options)=>{if(String(input)!=='/api/routines'||options?.method==='POST')throw new Error('Fixture forbids execution');return Response.json(data);};
createRoot(document.getElementById('root')).render(<main style={{padding:20,maxWidth:900,margin:'auto'}}><RoutinesPanel/></main>);`;
await writeFile(path.join(directory, "fixture.tsx"), source);
await build({
  entryPoints: [path.join(directory, "fixture.tsx")],
  outfile: path.join(directory, "bundle.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  alias: {
    react: path.dirname(require.resolve("react")),
    "react-dom": path.dirname(require.resolve("react-dom")),
  },
  define: { "process.env.NODE_ENV": '"production"' },
});
const styles = (await readdir(path.join(root, ".next/static/chunks"))).filter(
  (f) => f.endsWith(".css"),
);
await writeFile(
  path.join(directory, "app.css"),
  (
    await Promise.all(
      styles.map((f) =>
        readFile(path.join(root, ".next/static/chunks", f), "utf8"),
      ),
    )
  ).join("\n"),
);
await writeFile(
  path.join(directory, "index.html"),
  '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:white;color:#202124;font-family:Arial,sans-serif}button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #3460cc;outline-offset:3px}</style><title>Routine readiness qualification</title></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
);
console.log(directory);
