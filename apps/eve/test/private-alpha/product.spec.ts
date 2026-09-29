import { test, expect, type Page } from "@playwright/test";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { exampleSnapshot } from "../../components/owner/preview";
import { productApprovalFixtures } from "../../components/owner/product-fixtures";
const output = process.env.MYEVE_PRODUCT_EVIDENCE_ROOT ? path.join(process.env.MYEVE_PRODUCT_EVIDENCE_ROOT, "private-alpha") : path.resolve(
  import.meta.dirname,
  "../../../../output/playwright/private-alpha",
);
const id = "11111111-1111-4111-8111-111111111111",
  versionId = "22222222-2222-4222-8222-222222222222";
const version = {
  id: versionId,
  artifactId: id,
  ordinal: 1,
  filename: "launch.md",
  blobUrl: "https://example.invalid/private",
  blobPath: "fixture/launch.md",
  sizeBytes: 16,
  sha256: "a".repeat(64),
  createdFrom: "agent",
  changeSummary: "Initial draft",
  createdBy: "Sofie",
  createdAt: new Date().toISOString(),
};
const artifact = {
  id,
  workspaceId: "alpha-fixture-owner",
  title: "Launch report",
  kind: "markdown",
  mimeType: "text/markdown",
  currentVersionId: versionId,
  originThreadId: null,
  originSessionId: null,
  createdBy: "Sofie",
  createdAt: version.createdAt,
  updatedAt: version.createdAt,
  currentVersion: version,
};
test.beforeEach(async ({ context, page }) => {
  const login = await context.request.post("/api/auth/login", {
    data: { password: "local-alpha-fixture-password" },
  });
  expect(login.status()).toBe(200);
  const state = await context.storageState();
  await context.addCookies(
    state.cookies.map((cookie) => ({ ...cookie, secure: false })),
  );
  const sample = exampleSnapshot();
  let approvals = productApprovalFixtures();
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname;
    if (p.startsWith("/api/auth/")) return route.continue();
    if (req.method() === "PATCH" && p.startsWith("/api/approvals/")) {
      const data = req.postDataJSON(),
        item = approvals.find((row) => p.endsWith(row.id));
      if (
        !item ||
        item.status !== "pending" ||
        data.bindingHash !== item.bindingHash
      )
        return route.fulfill({ status: 409, json: { error: "stale" } });
      const approval = {
        ...item,
        status: data.decision,
        decision: data.decision,
      };
      approvals = approvals.map((row) => (row.id === item.id ? approval : row));
      return route.fulfill({ json: { approval } });
    }
    if (req.method() !== "GET")
      return route.fulfill({
        status: 403,
        json: { error: "Fixture forbids writes" },
      });
    const responses: Record<string, unknown> = {
      "/api/goals": { goals: sample.goals },
      "/api/task-runs": { tasks: sample.tasks },
      "/api/outcomes": { outcomes: sample.outcomes },
      "/api/approvals": {
        approvals:
          url.searchParams.get("status") === "pending"
            ? approvals.filter((a) => a.status === "pending")
            : approvals,
      },
      "/api/reviews": {
        review:
          url.searchParams.get("kind") === "weekly"
            ? {
                kind: "weekly",
                generatedAt: version.createdAt,
                periodStart: version.createdAt,
                periodEnd: version.createdAt,
                progress: [],
                completedGoals: [],
                completedTasks: [],
                stalled: [],
                blockers: [],
                missedCommitments: [],
                outcomes: sample.outcomes,
                proposedPriorities: [],
              }
            : sample.brief,
      },
      "/api/connections": {
        connections: [
          {
            toolkit: "github",
            name: "GitHub",
            accounts: [
              { id: "fixture", status: "ACTIVE", label: "Owner fixture" },
            ],
          },
        ],
        catalogComplete: true,
      },
      "/api/agents": { agents: [] },
      "/api/owner-knowledge": { items: [], hasMore: false, page: 1, limit: 25 },
      "/api/channels": {
        channels: [
          {
            id: "email",
            label: "Email",
            state: "ready",
            summary: "One incoming thread",
            detail: "sofie@example.invalid",
            href: "/email",
            actionLabel: "Open email",
          },
          {
            id: "slack",
            label: "Slack",
            state: "setup_required",
            summary: "Workspace not connected",
            detail: "Connect Slack before receiving mentions",
            href: "/manage/slack",
            actionLabel: "Set up Slack",
          },
        ],
      },
      "/api/email": {
        configured: true,
        threads: [
          {
            threadId: "fixture-email",
            subject: "Launch planning",
            preview: "Please review the draft on Friday.",
            correspondents: [],
            messageCount: 2,
            timestamp: version.createdAt,
            unread: true,
            labels: [],
            attachmentCount: 0,
          },
        ],
      },
      "/api/threads/search": { results: [] },
      "/api/artifacts": { artifacts: [artifact] },
      [`/api/artifacts/${id}`]: { artifact, versions: [version], comments: [] },
      [`/api/artifacts/${id}/draft`]: { draft: null },
      [`/api/artifacts/${id}/shares`]: { shares: [] },
      "/api/computer-runtime": { state: "NOT_CONFIGURED" },
      "/api/computer-profiles": { profiles: [] },
      "/api/computer-sessions": { sessions: [] },
    };
    if (p === `/api/artifacts/${id}/content`)
      return route.fulfill({
        contentType: "text/markdown",
        body: "# Launch report\n\nFixture content.",
      });
    return p in responses
      ? route.fulfill({ json: responses[p] })
      : route.fulfill({
          status: 503,
          json: { error: "Source not configured in fixture" },
        });
  });
});
async function qualify(page: Page, name: string, project: string) {
  await mkdir(output, { recursive: true });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.addScriptTag({
    path: "/private/tmp/private-alpha-qa/node_modules/axe-core/axe.min.js",
  });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.mode=theme; },theme);
    const audit=await page.evaluate(async()=>await (window as any).axe.run({runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}}));
    const violations=audit.violations.map((v:any)=>({id:v.id,targets:v.nodes.map((n:any)=>n.target)}));
    await appendFile(path.join(output,"accessibility-final.jsonl"),JSON.stringify({name,project,theme,violations})+"\n");
    expect(violations).toEqual([]);
    await page.screenshot({path:path.join(output,`${project}-${name}-${theme}.png`),fullPage:true});
  }
  await page.evaluate(()=>{document.documentElement.dataset.mode="light";});
}
test("product destinations and source states", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [route, title] of [
    ["/today", "Today"],
    ["/inbox", "Sofie’s inbox"],
    ["/team", "Sofie’s team"],
    ["/apps", "Apps"],
    ["/weekly", "Weekly Review"],
    ["/privacy", "Private by default"],
    ["/rooms", "Shared rooms"],
    ["/computer", "Computer workspace"],
  ]) {
    await page.goto(route!);
    await expect(
      page.getByRole("heading", { name: title!, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Loading current records…")).toHaveCount(0);
    await qualify(page, route!.slice(1), info.project.name);
  }
  expect(errors).toEqual([]);
});
test("exact approval and bounded history", async ({ page }, info) => {
  const pendingRequest = page.waitForRequest((req) =>
    req.url().includes("/api/approvals?status=pending"),
  );
  await page.goto("/approvals");
  await pendingRequest;
  await expect(
    page.getByRole("heading", { name: "Send the launch update" }),
  ).toBeVisible();
  await qualify(page, "approvals", info.project.name);
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Send the launch update" }),
  });
  await card.getByText("Modify this proposal").click();
  await expect(card.getByText(/fresh approval/)).toBeVisible();
  await card
    .getByRole("button", { name: "Allow this action", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Decision saved: allowed",
  );
  await expect(
    page.getByRole("heading", { name: "Send the launch update" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Send the launch update" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Allow this action", exact: true }),
  ).toHaveCount(0);
});
test("artifact link mounts revision workspace", async ({ page }, info) => {
  await page.goto("/workspace");
  await expect(
    page.getByRole("heading", { name: "Launch report" }),
  ).toBeVisible();
  await qualify(page, "files", info.project.name);
  await page
    .getByRole("link", { name: "Open preview, versions & comments" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${id}`));
  await expect(page.getByText(/revision 1/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download this revision" }),
  ).toBeVisible();
  await qualify(page, "artifact-editor", info.project.name);
});
test("search cancellation, source errors, and command keyboard flow", async ({
  page,
}, info) => {
  await page.goto("/search");
  await page.getByLabel("Search your workspace").fill("launch");
  await expect(
    page.getByRole("heading", { name: "Goals & work" }),
  ).toBeVisible();
  await qualify(page, "search", info.project.name);
  await page.route("**/api/owner-knowledge?**", (route) =>
    route.fulfill({ status: 401, json: { error: "expired" } }),
  );
  await page.getByLabel("Search your workspace").fill("Friday");
  await expect(
    page.getByRole("alert").filter({ hasText: "Your session needs attention" }),
  ).toContainText("Sign in again");
  await page.getByLabel("Search your workspace").fill("x");
  await expect(page.getByRole("heading", { name: "Goals & work" })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Search and commands (Command K)" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Search threads and messages").fill("Weekly");
  await expect(
    dialog.getByRole("button", { name: /Open Weekly Review/ }),
  ).toBeVisible();
  await page.getByLabel("Search threads and messages").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Search threads and messages")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Search and commands (Command K)" }),
  ).toBeFocused();
});
test("disconnected contract preview never performs a write", async ({
  page,
}, info) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  });
  await page.goto("/product-preview");
  await expect(
    page.getByText("Fixture evidence — no live execution"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try allowing this action" })
    .first()
    .click();
  await expect(
    page.getByText("Sample decision recorded locally. No action executed."),
  ).toBeVisible();
  await expect(page.getByText("Ready: false")).toBeVisible();
  await qualify(page, "contract-preview", info.project.name);
  expect(writes).toEqual([]);
});
test("outage and empty states do not claim success", async ({ page }, info) => {
  await page.route("**/api/approvals**", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/approvals");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The service could not confirm" }),
  ).toBeVisible();
  await expect(page.getByText("No pending approvals")).toHaveCount(0);
  await qualify(page, "approval-outage", info.project.name);
  await page.route("**/api/artifacts?**", (route) =>
    route.fulfill({ json: { artifacts: [] } }),
  );
  await page.goto("/workspace");
  await expect(
    page.getByRole("heading", { name: "No matching artifacts" }),
  ).toBeVisible();
});

test("late search responses cannot replace the current query", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/threads/search?**", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    if (q === "old") {
      await gate;
      await route
        .fulfill({
          json: {
            results: [
              { id: "old", title: "STALE PRIVATE RESPONSE", snippet: null },
            ],
          },
        })
        .catch(() => {});
    } else
      await route.fulfill({
        json: {
          results: [
            { id: "new", title: "Current search response", snippet: null },
          ],
        },
      });
  });
  await page.goto("/search");
  const requested = page.waitForRequest((req) =>
    req.url().includes("/api/threads/search?q=old"),
  );
  await page.getByLabel("Search your workspace").fill("old");
  await requested;
  await page.getByLabel("Search your workspace").fill("new");
  await expect(page.getByText("Current search response")).toBeVisible();
  release();
  await expect(page.getByText("STALE PRIVATE RESPONSE")).toHaveCount(0);
});
