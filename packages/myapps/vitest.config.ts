import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../apps/eve/", import.meta.url)) },
  },
  test: {
    fileParallelism: false,
    include: [
      "packages/myapps/integration/*.test.ts",
      "apps/eve/lib/database-schema.test.ts",
    ],
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
