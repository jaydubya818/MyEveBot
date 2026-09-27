import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { appendFile, mkdir } from "node:fs/promises";
import {
  exampleSnapshot,
  type PreviewSnapshot,
} from "../../components/owner/preview";
test.beforeEach(async ({ context }) => {
  const response = await context.request.post(
    "http://127.0.0.1:3091/api/auth/login",
    {
      data: { password: "local-beta-ui-fixture-only" },
    },
  );
  expect(response.status()).toBe(200);
  const state = await context.storageState();
  // Production uses secure cookies. Only this HTTP-loopback harness relaxes the flag.
  await context.addCookies(
    state.cookies.map((cookie) => ({ ...cookie, secure: false })),
  );
});
const output = path.resolve(
  import.meta.dirname,
  "../../../../output/playwright/beta-product-experience",
);
async function capture(page: Page, name: string, project: string) {
  await mkdir(output, { recursive: true });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: `${output}/${project}-${name}.png`,
    fullPage: true,
  });
}
async function accessibility(page: Page) {
  await page.addScriptTag({
    path:
      process.env.MYEVE_AXE_PATH ??
      "/tmp/myeve-beta-accessibility/node_modules/axe-core/axe.min.js",
  });
  const result = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (options: unknown) => Promise<{
            violations: Array<{
              id: string;
              impact: string;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    return axe.run({
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
  });
  await mkdir(output, { recursive: true });
  await appendFile(
    `${output}/accessibility.jsonl`,
    JSON.stringify({
      path: new URL(page.url()).pathname,
      viewport: page.viewportSize(),
      theme: await page.locator("html").getAttribute("data-mode"),
      violations: result.violations,
    }) + "\n",
  );
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}
async function mockServices(page: Page, snapshot: PreviewSnapshot) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      method = route.request().method();
    let body: unknown = {};
    if (path === "/api/goals") {
      if (method === "POST") {
        const draft = route.request().postDataJSON();
        const goal = {
          ...snapshot.details["preview-work"],
          ...draft,
          id: "created-work",
        };
        snapshot.goals.push(goal);
        snapshot.details[goal.id] = goal;
        body = { goal };
      } else body = { goals: snapshot.goals };
    } else if (path.startsWith("/api/goals/"))
      body = { goal: snapshot.details[path.split("/").at(-1)!] };
    else if (path === "/api/task-runs")
      body = {
        tasks: url.searchParams.has("threadId")
          ? snapshot.tasks.filter(
              (task) => task.threadId === url.searchParams.get("threadId"),
            )
          : snapshot.tasks,
      };
    else if (path === "/api/outcomes") body = { outcomes: snapshot.outcomes };
    else if (path.startsWith("/api/outcomes/")) {
      const outcome = snapshot.outcomes.find(
        (item) => item.id === path.split("/").at(-1),
      )!;
      outcome.ownerFeedback = route.request().postDataJSON().ownerFeedback;
      body = { outcome };
    } else if (path === "/api/approvals")
      body = { approvals: snapshot.approvals };
    else if (path.startsWith("/api/approvals/")) {
      const approval = snapshot.approvals.find(
        (item) => item.id === path.split("/").at(-1),
      )!;
      const input = route.request().postDataJSON();
      expect(input.bindingHash).toBe(approval.bindingHash);
      approval.status = input.decision;
      approval.decision = input.decision;
      approval.decidedAt = new Date().toISOString();
      body = { approval };
    } else if (path === "/api/reviews") body = { review: snapshot.brief };
    else if (path === "/api/threads") body = { threads: [] };
    else if (path === "/api/capabilities") body = { capabilities: [] };
    else if (path === "/api/models") body = { models: [] };
    else if (path === "/api/files") body = { files: [] };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.route("**/eve/**", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
}

test("new owner through results, proof, feedback and next-day brief (sample journey)", async ({
  page,
}, info) => {
  let liveWrites = 0;
  page.on("request", (request) => {
    if (/\/api\/|\/eve\//.test(request.url()) && request.method() !== "GET")
      liveWrites++;
  });
  await page.goto("/beta-preview");
  await page.getByRole("button", { name: "Try a new owner" }).click();
  await page.getByRole("link", { name: "Meet Sofie", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Meet Sofie" })).toBeVisible();
  await capture(page, "onboarding", info.project.name);
  await accessibility(page);
  await page.getByRole("link", { name: "Choose your first outcome" }).click();
  await page.getByLabel("Desired outcome").fill("Prepare my partner briefing");
  await page
    .getByLabel("What would make it a good result?")
    .fill("One page\nCite the source notes");
  await page
    .getByLabel("Context and boundaries")
    .fill("For tomorrow’s meeting. Ask before sharing externally.");
  await page.getByRole("button", { name: "Save sample work" }).click();
  await expect(
    page.getByText("Work saved. Let’s shape the plan."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan this with Sofie" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Preview handoff prepared",
  );
  await page.getByRole("link", { name: "View saved work" }).click();
  await expect(
    page.getByRole("heading", { name: "Prepare my partner briefing" }),
  ).toBeVisible();
  await expect(page.getByText("No execution is linked")).toBeVisible();
  await capture(page, "first-work", info.project.name);
  await page.getByRole("button", { name: "Load example journey" }).click();
  await page.goto("/beta-preview?view=work&id=preview-work");
  await expect(
    page.getByText("Example delegation: Sofie asked MyFactory", {
      exact: false,
    }),
  ).toBeVisible();
  await capture(page, "delegated-work", info.project.name);
  await accessibility(page);
  await page.getByRole("link", { name: "Review pending decisions" }).click();
  await capture(page, "needs-you", info.project.name);
  await accessibility(page);
  await page.getByRole("button", { name: "Try allowing this action" }).click();
  await expect(page.getByRole("status")).toContainText(
    "No external action was taken",
  );
  await page.goto("/beta-preview?view=results&id=preview-result");
  await expect(
    page.getByText("Independent verification is not recorded."),
  ).toBeVisible();
  await page
    .getByText("Technical evidence & provenance", { exact: true })
    .click();
  await expect(
    page.getByText("Event reference:", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Useful", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Sample feedback saved");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Useful", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await capture(page, "result-proof-feedback", info.project.name);
  await accessibility(page);
  await page.clock.setFixedTime(new Date(Date.now() + 86400000));
  await page.goto("/beta-preview?view=brief");
  await capture(page, "daily-brief", info.project.name);
  await accessibility(page);
  await page.goto("/beta-preview");
  await capture(page, "today", info.project.name);
  await accessibility(page);
  expect(liveWrites).toBe(0);
});

test("live UI contract journey saves draft, carries context to conversation, and preserves approval binding", async ({
  page,
}, info) => {
  const snapshot = exampleSnapshot();
  await mockServices(page, snapshot);
  await page.goto("/work/new");
  await page
    .getByLabel("Desired outcome")
    .fill("Draft next week’s owner update");
  await page
    .getByLabel("What would make it a good result?")
    .fill("Include sources and unresolved decisions");
  await page.getByRole("button", { name: "Save work & plan next" }).click();
  await page.getByRole("button", { name: "Plan this with Sofie" }).click();
  const composer = page.getByPlaceholder("Message Sofie... (/ for commands)");
  await expect(composer).toHaveValue(/created-work/);
  await expect(composer).toHaveValue(
    /Do not treat this message as execution approval/,
  );
  await capture(page, "conversation-draft", info.project.name);
  await accessibility(page);
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open threads" }).click();
    await capture(page, "navigation", info.project.name);
    await accessibility(page);
  }
  await expect(
    page
      .getByRole("navigation", { name: "Primary", exact: true })
      .getByRole("link", { name: "Today", exact: true }),
  ).toBeVisible();
  if (info.project.name === "mobile") {
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open threads" }),
    ).toBeFocused();
  }
  await page.goto("/needs-you");
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Decision recorded");
  await expect(
    page.getByRole("button", { name: "Allow this action", exact: true }),
  ).toHaveCount(0);
  await page.goto("/results?id=preview-result");
  await page.getByRole("button", { name: "Useful", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Feedback saved to this result",
  );
  await page.getByRole("button", { name: "Correct this" }).click();
  await expect(composer).toHaveValue(/preview-result/);
  await expect(composer).toHaveValue(/preview-event/);
});

test("partial data, expired session, stale decision and feedback retry remain honest", async ({
  page,
}, info) => {
  const snapshot = exampleSnapshot();
  await mockServices(page, snapshot);
  await page.route("**/api/approvals", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/today");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Decisions",
  );
  await expect(
    page.getByText("No approvals waiting", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: "Prepare the design partner welcome pack",
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, "partial-outage", info.project.name);
  await page.unroute("**/api/approvals");
  await page.route("**/api/approvals/*", (route) =>
    route.fulfill({ status: 409, body: "{}" }),
  );
  await page.goto("/needs-you");
  await page
    .getByRole("button", { name: "Allow this action", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "changed or the decision expired",
  );
  await expect(
    page.getByText("Decision recorded.", { exact: false }),
  ).toHaveCount(0);
  await page.route("**/api/outcomes/*", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/results?id=preview-result");
  await page.getByRole("button", { name: "Useful", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "could not confirm",
  );
  await expect(
    page.getByRole("button", { name: "Useful", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.unroute("**/api/outcomes/*");
  await page.getByRole("button", { name: "Useful", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Feedback saved");
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 401, body: "{}" }),
  );
  await page.goto("/today");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "session needs attention",
  );
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await capture(page, "expired-session", info.project.name);
  await accessibility(page);
});

test("loading, empty, keyboard focus, expired approvals and next-visit changes", async ({
  page,
}, info) => {
  const snapshot = exampleSnapshot();
  snapshot.approvals[0]!.expiresAt = "2020-01-01T00:00:00Z";
  await mockServices(page, snapshot);
  await page.goto("/needs-you");
  await expect(
    page.getByRole("button", { name: "Allow this action", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  await page.goto("/today");
  await expect(
    page.getByText("Since your last visit", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Checked", { exact: false }).last(),
  ).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem(
      "myeve-today-last-visit",
      new Date(Date.now() - 86400000).toISOString(),
    ),
  );
  await page.reload();
  await expect(
    page.getByText("3 work items changed since", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#owner-content")).toBeFocused();
  await page.route("**/api/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    const path = new URL(route.request().url()).pathname;
    const field = path.includes("task-runs")
      ? "tasks"
      : path.includes("outcomes")
        ? "outcomes"
        : path.includes("approvals")
          ? "approvals"
          : "goals";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        path.includes("reviews")
          ? {
              review: {
                ...snapshot.brief,
                completed: [],
                blocked: [],
                recommendations: [],
              },
            }
          : { [field]: [] },
      ),
    });
  });
  await page.goto("/today");
  await expect(page.getByRole("status")).toContainText("Loading");
  await expect(
    page.getByText("What would you like off your plate?"),
  ).toBeVisible();
  await capture(page, "empty-today", info.project.name);
  await accessibility(page);
});

test("retained result evidence is loaded by exact run identity and failed work remains visible", async ({
  page,
}, info) => {
  const snapshot = exampleSnapshot();
  const retained = {
    ...snapshot.tasks[0]!,
    id: "retained-run",
    status: "completed" as const,
    checks: [
      { ...snapshot.tasks[0]!.checks[0]!, label: "Retained result check" },
    ],
  };
  snapshot.outcomes[0]!.runId = retained.id;
  snapshot.tasks[0]!.status = "failed";
  snapshot.tasks[0]!.statusReason = "UNKNOWN_EXECUTION";
  await mockServices(page, snapshot);
  await page.route("**/api/task-runs/retained-run", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ task: retained }),
    }),
  );
  await page.goto("/results?id=preview-result");
  await expect(
    page.getByText("Retained result check", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Required sections are present", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("All required recorded checks passed.", { exact: false }),
  ).toBeVisible();
  await page.goto("/needs-you");
  await expect(
    page.getByRole("link", { name: "Draft welcome pack", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Draft welcome pack", exact: true })
    .click();
  await expect(
    page.getByText("This attempt did not finish successfully.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("UNKNOWN_EXECUTION", { exact: true }),
  ).toHaveCount(0);
  await capture(page, "failure-recovery", info.project.name);
  await accessibility(page);
});

test("first-work retry keeps the draft and idempotency identity; dark theme remains accessible", async ({
  page,
}, info) => {
  const snapshot = exampleSnapshot();
  await mockServices(page, snapshot);
  const keys: string[] = [];
  await page.route("**/api/goals", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    keys.push(body.idempotencyKey);
    if (keys.length === 1) return route.fulfill({ status: 503, body: "{}" });
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        goal: {
          ...snapshot.details["preview-work"],
          ...body,
          id: "retry-work",
        },
      }),
    });
  });
  await page.goto("/work/new");
  await page
    .getByLabel("Desired outcome")
    .fill("Keep this draft through an outage");
  await page.getByRole("button", { name: "Save work & plan next" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "could not confirm",
  );
  await expect(page.getByLabel("Desired outcome")).toHaveValue(
    "Keep this draft through an outage",
  );
  await page.getByRole("button", { name: "Save work & plan next" }).click();
  await expect(
    page.getByText("Work saved. Let’s shape the plan."),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.evaluate(() =>
    localStorage.setItem("sofie.appearance.theme", "dark"),
  );
  await page.goto("/today");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expect(
    page.getByText("Checked", { exact: false }).last(),
  ).toBeVisible();
  await capture(page, "today-dark", info.project.name);
  await accessibility(page);
});
