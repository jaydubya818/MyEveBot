import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { installedSkills } from "../installed-skills.ts";
import { externalAlphaPrompt } from "./model.ts";
import { EXTERNAL_ALPHA_INSTRUCTIONS, SKILL_CATALOG_HEADER, omitUnavailableSkillCatalog } from "./context.ts";
import { optionalDeploymentInstructions } from "../../agent/lib/optional-deployment-instructions.ts";

const catalog = SKILL_CATALOG_HEADER + "\n" + installedSkills.map(skill =>
  `- ${skill.name}: ${skill.description} (path: $HOME/.agents/skills/${skill.name}/SKILL.md)`,
).join("\n");
const mandatory = "Identity: Sofie. Owner A only. Never expose credentials. Custom policy: do not contact third parties.";
afterEach(() => vi.unstubAllEnvs());

it("pins the framework formatter version used by the compatibility adapter", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(readFileSync(new URL("../../../../package-lock.json", import.meta.url), "utf8"));
  expect(pkg.dependencies.eve).toBe("0.66.3");
  expect(lock.packages["node_modules/eve"].version).toBe("0.66.3");
});

it("fits a clean-owner first message without changing mandatory policy or owner text", () => {
  const user = { role: "user" as const, content: [{ type: "text" as const, text: "Add a Low / Medium / High Priority field to Alpha Tasks." }] };
  const system = mandatory + "\n\n" + catalog + "\n\n" + EXTERNAL_ALPHA_INSTRUCTIONS;
  const scoped = externalAlphaPrompt({ prompt: [{ role: "system", content: system }, user], tools: [] });
  expect(scoped.prompt[0].content).toBe(mandatory + "\n\nSkills are unavailable in this external-alpha session.\n\n" + EXTERNAL_ALPHA_INSTRUCTIONS);
  expect(scoped.prompt[1]).toBe(user);
  expect(scoped.maxOutputTokens).toBe(1024);
  expect(Buffer.byteLength(JSON.stringify({ prompt: scoped.prompt, tools: scoped.tools }))).toBeLessThan(32_000);
});

it("accepts only the complete known catalog, including Eve's single trailing description newline", () => {
  const newline = catalog.replace(" (path: $HOME/.agents/skills/evidence-driven-testing/", "\n (path: $HOME/.agents/skills/evidence-driven-testing/");
  expect(omitUnavailableSkillCatalog(newline)).toBe("Skills are unavailable in this external-alpha session.");
  const lines = catalog.split("\n");
  for (const changed of [
    catalog + "\n- extra: New skill (path: $HOME/.agents/skills/extra/SKILL.md)",
    lines.slice(0, -1).join("\n"),
    [...lines.slice(0, 8), ...lines.slice(8).reverse()].join("\n"),
    catalog.replace("Guides stable API", "Changed API"),
    catalog + "\n\n" + catalog,
    catalog.replace("Available skills", "Available project skills"),
  ]) expect(omitUnavailableSkillCatalog(changed)).toBe(changed);
});

it("never drops policy, oversized owner requests, history, or tool schemas to fit", () => {
  for (const prompt of [
    [{ role: "system" as const, content: mandatory + "\n" + "policy ".repeat(6000) }],
    [{ role: "system" as const, content: EXTERNAL_ALPHA_INSTRUCTIONS }, { role: "user" as const, content: [{ type: "text" as const, text: "🙂".repeat(9000) }] }],
    [{ role: "user" as const, content: [{ type: "text" as const, text: catalog + "\n" + "history ".repeat(5000) }] }],
  ]) expect(() => externalAlphaPrompt({ prompt, tools: [] })).toThrow("CONTEXT_BOUND");
  expect(() => externalAlphaPrompt({ prompt: [], tools: [{ type: "function", name: "engineering_work", description: "schema ".repeat(6000), inputSchema: {} }] })).toThrow("CONTEXT_BOUND");
});

it("defers unrelated management tools in a selected-Work conversation without altering retained schemas", () => {
  const work = { type: "function" as const, name: "engineering_work", inputSchema: { type: "object" as const, required: ["operation"] } };
  const tools = [work, { type: "function" as const, name: "manage_agent", inputSchema: {} }];
  expect(externalAlphaPrompt({ prompt: [], tools }, true).tools).toEqual([work]);
  expect(externalAlphaPrompt({ prompt: [], tools }).tools).toEqual(tools);
});

it("defers optional deployment instructions only for external alpha", async () => {
  const definition = optionalDeploymentInstructions({ markdown: "Optional computer procedure" });
  vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1");
  expect(await definition.events["turn.started"]!({} as never, {} as never)).toBeNull();
  vi.stubEnv("EVE_PROJECT_NAME", "ordinary-deployment");
  expect(await definition.events["turn.started"]!({} as never, {} as never)).toEqual(expect.objectContaining({ markdown: "Optional computer procedure" }));
});
