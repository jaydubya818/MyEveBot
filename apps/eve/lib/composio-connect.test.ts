import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FALLBACK_TOOLKITS,
  manageConnections,
  mergeComposioToolkitCatalogs,
  parseComposioToolkitCatalog,
  validateComposioToolkitCatalog,
} from "./composio-connect";

describe("connection-status access", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it.each(["add", "remove", "unknown"])("blocks %s before contacting Composio, even in a mixed batch", async (action) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(manageConnections([
      { name: "slack", action: "list" },
      { name: "gmail", action: action as "add" },
    ])).rejects.toMatchObject({ code: "external_write_blocked" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["success", "http-error", "tool-error", "provider-error"])("handles a read-only status response: %s", async (outcome) => {
    vi.stubEnv("COMPOSIO_API_KEY", "test-key");
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { headers: { "mcp-session-id": "test-session" } }))
      .mockResolvedValueOnce(Response.json({ result: {
        isError: outcome === "tool-error",
        content: [{ type: "text", text: JSON.stringify({ successful: outcome !== "provider-error", data: { connected: false } }) }],
      } }, { status: outcome === "http-error" ? 503 : 200 }));
    vi.stubGlobal("fetch", fetch);
    const result = manageConnections([{ name: "slack", action: "list" }]);
    if (outcome === "success") await expect(result).resolves.toEqual({ connected: false });
    else await expect(result).rejects.toThrow();
    expect(JSON.parse(fetch.mock.calls[1][1].body).params).toEqual({
      name: "COMPOSIO_MANAGE_CONNECTIONS", arguments: { toolkits: [{ name: "slack", action: "list" }] },
    });
  });
});

describe("parseComposioToolkitCatalog", () => {
  it("extracts and sorts the structured toolkit catalog", () => {
    expect(
      parseComposioToolkitCatalog([
        { slug: "slack", name: "Slack", tools: [{ slug: "SLACK_SEND_MESSAGE" }] },
        { slug: "acme", name: "Acme & Sons", category: "developer tools" },
      ]),
    ).toEqual([
      { slug: "acme", name: "Acme & Sons" },
      { slug: "slack", name: "Slack" },
    ]);
  });

  it("rejects a malformed entry instead of silently omitting it", () => {
    expect(() =>
      parseComposioToolkitCatalog([
        { slug: "figma", name: "Figma" },
        { slug: "changed-upstream-shape", label: "Changed upstream shape" },
      ]),
    ).toThrow("entry 1 was invalid");
  });

  it("rejects duplicate slugs instead of masking catalog corruption", () => {
    expect(() =>
      parseComposioToolkitCatalog([
        { slug: "figma", name: "Figma" },
        { slug: "figma", name: "Figma duplicate" },
      ]),
    ).toThrow("duplicate slug figma");
  });
});

describe("FALLBACK_TOOLKITS", () => {
  it("retains the full catalog snapshot for cold-start outages", () => {
    expect(FALLBACK_TOOLKITS.length).toBeGreaterThanOrEqual(1_000);
    expect(new Set(FALLBACK_TOOLKITS.map(({ slug }) => slug)).size).toBe(
      FALLBACK_TOOLKITS.length,
    );
    expect(FALLBACK_TOOLKITS).toContainEqual({ slug: "figma", name: "Figma" });
  });

  it("allows normal catalog drift but rejects a substantially partial parse", () => {
    expect(() => validateComposioToolkitCatalog(FALLBACK_TOOLKITS.slice(1))).not.toThrow();
    expect(() => validateComposioToolkitCatalog(FALLBACK_TOOLKITS.slice(0, 100))).toThrow(
      "catalog was incomplete",
    );
  });

  it("keeps snapshot slugs while preferring current names and additions", () => {
    expect(
      mergeComposioToolkitCatalogs(FALLBACK_TOOLKITS, [
        { slug: "figma", name: "Figma Current" },
        { slug: "new_toolkit", name: "New Toolkit" },
      ]),
    ).toEqual(
      expect.arrayContaining([
        { slug: "figma", name: "Figma Current" },
        { slug: "new_toolkit", name: "New Toolkit" },
      ]),
    );
  });
});
