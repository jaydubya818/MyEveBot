import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { ReferenceStore } from "../src/store.ts";
import { Crm } from "../src/crm.ts";
import { resolveApp } from "../src/resolver.ts";
import {
  makePackage,
  installed,
  principal,
  leadInput,
} from "../test/fixtures.mjs";
const store = new ReferenceStore(),
  pkg = makePackage(),
  row = installed(store),
  crm = new Crm(store, principal()),
  session = store.session(principal());
const samples = { registry: [], resolver: [], query: [], action: [] };
try {
  for (let i = 0; i < 100; i++) {
    for (const [kind, run] of Object.entries({
      registry: () => session.get(pkg.appId),
      resolver: () => resolveApp(store, principal(), "listLeads"),
      query: () => crm.query(pkg.appId, 1, row.digest, "listLeads", {}),
      action: () =>
        crm.action(
          pkg.appId,
          1,
          row.digest,
          "createLead",
          { ...leadInput, company: "Synthetic " + i },
          "lead-" + i,
        ),
    })) {
      const start = performance.now();
      run();
      samples[kind].push(performance.now() - start);
    }
  }
  const measurements = Object.fromEntries(
    Object.entries(samples).map(([name, values]) => {
      values.sort((a, b) => a - b);
      return [
        name,
        {
          count: values.length,
          p50Ms: values[49],
          p95Ms: values[94],
          maxMs: values.at(-1),
        },
      ];
    }),
  );
  mkdirSync("output/playwright/myapps", { recursive: true });
  writeFileSync(
    "output/playwright/myapps/performance.json",
    JSON.stringify(
      {
        scope: "local synthetic reference, 100 leads; not a production SLO",
        measurements,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(measurements));
} finally {
  store.close();
}
