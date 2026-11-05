import { describe, expect, it } from "vitest";
import { allowedPathScopeSchema, pathSchema } from "./contract.ts";

describe("allowed path scopes", () => {
  it("accepts exact bounded paths and MyFactory directory scopes", () => {
    for (const p of ["src/**", "test/**", "src/components/**", "playwright.config.ts", "README.md", "package.json"]) expect(allowedPathScopeSchema.parse(p)).toBe(p);
  });
  it("refuses any other wildcard, traversal, hidden or protected scope", () => {
    for (const p of ["**", "/**", "*", "src/*", "src/**/x", "src/**/**", "../**", "src/../**", ".github/**", "node_modules/**", "src//**", "/src/**", "secrets/**", "src/*.ts"])
      expect(allowedPathScopeSchema.safeParse(p).success, p).toBe(false);
  });
  it("leaves exact-path schemas unchanged", () => { expect(pathSchema.safeParse("src/**").success).toBe(false); });
});
