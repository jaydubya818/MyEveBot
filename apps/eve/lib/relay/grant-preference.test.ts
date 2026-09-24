import { describe, expect, it, vi } from "vitest";
const settings = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("../../agent/lib/settings-db.ts", () => ({ settingsStore: settings }));
import { ownerCommand } from "./owner-api";
import type { FederationStore } from "./store";

describe("owner grant expiry preference", () => {
  it("namespaces the setting by the authenticated store owner and never changes grants", async () => {
    const query = vi.fn();
    for (const ownerId of ["alice", "bob"]) {
      await expect(ownerCommand({ ownerId, database: { query } } as unknown as FederationStore,
        { operation: "grant-duration", input: "never" })).resolves.toEqual({ duration: "never" });
      expect(settings.set).toHaveBeenLastCalledWith(`relay-grant-duration:${ownerId}`, "never");
    }
    expect(query).not.toHaveBeenCalled();
  });
  it("rejects invalid duration and owner overrides", async () => {
    settings.set.mockClear();
    const store = { ownerId: "alice" } as FederationStore;
    await expect(ownerCommand(store, { operation: "grant-duration", input: "invalid" })).rejects.toThrow();
    await expect(ownerCommand(store, { operation: "grant-duration", input: "never", ownerId: "bob" })).rejects.toThrow();
    expect(settings.set).not.toHaveBeenCalled();
  });
});
