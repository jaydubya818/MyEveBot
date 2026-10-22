import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The eve dev runtime keeps full snapshot copies of the app under
// .eve/dev-runtime/snapshots, so the default include pattern would run every
// suite several times over — once per stale snapshot.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // Files that explicitly opt in to a DOM environment use
    // `// @vitest-environment happy-dom` at the top of the file. The default
    // environment is 'node' so pure unit and SSR tests are unaffected.
    environmentMatchGlobs: [
      ["**/*.dom.test.ts", "happy-dom"],
      ["**/*.dom.test.tsx", "happy-dom"],
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.eve/**",
      "test/**",
      "scripts/*.test.mjs", // Node test runner; included by the root test command.
      "agent/skills/**",
    ],
  },
});
