import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebSessionToken } from "@/lib/web-auth";
import { evaluateDataset } from "@/lib/decision-intelligence/evaluation";
import { FakeDecisionProvider } from "@/lib/decision-intelligence/fixtures";
import { GET } from "./route";

let directory: string;
function request(query = "", token?: string) {
  return new Request(`http://localhost/api/decision-intelligence${query}`, {
    headers: token ? { cookie: `myeve_session=${token}` } : {},
  });
}
describe("read-only synthetic evidence API", () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "jev-api-"));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MYEVE_ACCESS_PASSWORD", "synthetic-qualification-password");
    vi.stubEnv(
      "MYEVE_SESSION_SECRET",
      "synthetic-session-secret-at-least-32-characters",
    );
    vi.stubEnv("MYEVE_OWNER_ID", "owner-a");
    vi.stubEnv("MYEVE_DECISION_EVIDENCE_DIR", directory);
    vi.stubEnv("MYEVE_DECISION_INTELLIGENCE_ENABLED", "false");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });
  it("denies unauthenticated access", async () => {
    expect((await GET(request())).status).toBe(401);
  });
  it("renders the empty/provider-free state without database or gateway access", async () => {
    const response = await GET(request("", createWebSessionToken()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: { status: "Not configured" },
      runs: [],
      metrics: null,
      rows: [],
    });
  });
  it("rejects owner selectors and cannot expose another owner's artifact", async () => {
    const response = await GET(
      request("?ownerId=owner-b", createWebSessionToken()),
    );
    expect(response.status).toBe(400);
    const run = await evaluateDataset(new FakeDecisionProvider(), {
      environment: "local-fixture",
      maxExamples: 6,
    });
    await writeFile(
      join(directory, "private.json"),
      JSON.stringify({
        ...run,
        ownerId: "owner-b",
        statement: "SYNTHETIC_SECRET_MARKER",
      }),
    );
    const rejected = await GET(request("", createWebSessionToken()));
    expect(rejected.status).toBe(503);
    expect(await rejected.text()).not.toContain("SYNTHETIC_SECRET_MARKER");
  });
  it("bounds rows, computes metrics, and exposes only synthetic inspection text", async () => {
    const run = await evaluateDataset(new FakeDecisionProvider(), {
      environment: "local-fixture",
    });
    await writeFile(join(directory, `${run.id}.json`), JSON.stringify(run));
    const token = createWebSessionToken();
    const body = await (await GET(request("", token))).json();
    expect(body.rows).toHaveLength(20);
    expect(body.metrics.attempted).toBe(210);
    expect(body.metrics.canonicalAccuracy).toBeNull();
    expect(body.provider.status).toBe("Not configured");
    const detail = await (
      await GET(request(`?decision=${run.rows[0]!.id}`, token))
    ).json();
    expect(detail.detail.text).toBeTruthy();
    expect(detail.detail.evidence.id).toBe(run.rows[0]!.id);
    const filtered = await (
      await GET(request("?filter=high-confidence-errors", token))
    ).json();
    expect(
      filtered.rows.every(
        (row: (typeof run.rows)[number]) =>
          row.result!.confidence! >= 0.95 &&
          row.result!.outcome !== row.expected,
      ),
    ).toBe(true);
  });
  it("returns stable errors for malformed artifacts without leaking diagnostics", async () => {
    await writeFile(
      join(directory, "malformed.json"),
      "SYNTHETIC_SECRET_MARKER",
    );
    const response = await GET(request("", createWebSessionToken()));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("decision_evidence_unavailable");
    expect(body).not.toContain("SYNTHETIC_SECRET_MARKER");
    expect(body).not.toContain(directory);
  });
});
