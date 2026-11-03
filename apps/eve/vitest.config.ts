import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const workspace = fileURLToPath(new URL(".", import.meta.url));

// The eve dev runtime keeps full snapshot copies of the app under
// .eve/dev-runtime/snapshots, so the default include pattern would run every
// suite several times over — once per stale snapshot.
export default defineConfig({
  resolve: {
    alias: {
      "@": workspace,
      // Force vitest to resolve react and react-dom from this workspace so
      // @testing-library/react (installed at the monorepo root) uses the same
      // React copy as the app code. Without this, the root's react-dom@18 is
      // used while the app has react@19, causing hook-call errors.
      "react": path.resolve(workspace, "node_modules/react"),
      "react-dom": path.resolve(workspace, "node_modules/react-dom"),
      "react-dom/client": path.resolve(workspace, "node_modules/react-dom/client"),
    },
  },
  test: {
    // Happy-DOM environment is activated per-file with the
    // `// @vitest-environment happy-dom` pragma at the top of the file.
    // vitest 5.x no longer supports environmentMatchGlobs; we use the pragma
    // instead so the intent is explicit and version-safe.
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
