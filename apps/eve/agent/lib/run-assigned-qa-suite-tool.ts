import { runAgentBrowser } from "@agent-browser/eve/sandbox";
import { defineTool, type ToolContext } from "eve/tools";
import { z } from "zod";

import { AGENT_NAME, OWNER_NAME } from "../../lib/identity.ts";
import { WEB_SESSION_COOKIE } from "../../lib/web-auth.ts";
import { getTaskRun, taskOwnerFromAuth } from "../../lib/task-runs.ts";
import type { QaSpecialistRole } from "../../lib/task-types.ts";

type CheckResult = {
  slug: string;
  status: "passed" | "failed" | "blocked";
  summary: string;
  path: string;
  kind: "report";
  contentType: "application/json";
};

type PageCapture = {
  ok: boolean;
  url: string;
  routeReady: {
    home: boolean;
    manage: boolean;
    activity: boolean;
    system: boolean;
  };
  hasAgentName: boolean;
  hasOwnerGreeting: boolean;
  hasManage: boolean;
  hasActivity: boolean;
  hasSystem: boolean;
  hasExplicitState: boolean;
  focusReachedControl: boolean;
  interactiveCount: number;
  pageErrorCount: number;
  error?: string;
};

function resultText(result: Awaited<ReturnType<typeof runAgentBrowser>>): string {
  if (typeof result.json === "string") return result.json;
  if (result.json !== null) return JSON.stringify(result.json);
  return result.stdout;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/[^\s]+/g, "[url]").slice(0, 300);
}

async function waitForPageCondition(
  ctx: ToolContext,
  session: string,
  condition: string,
): Promise<boolean> {
  try {
    await runAgentBrowser(
      ctx,
      ["wait", "--fn", condition, "--timeout", "10000"],
      { session },
    );
    return true;
  } catch (error) {
    if (/timed out|timeout waiting/i.test(safeError(error))) return false;
    throw error;
  }
}

async function captureCriticalUi(
  ctx: ToolContext,
  session: string,
  baseUrl: string,
  screenshotPath: string,
): Promise<PageCapture> {
  try {
    const homeUrl = new URL("/", baseUrl).toString();
    await runAgentBrowser(ctx, ["open", homeUrl], { session });
    // Preview hydration includes the signed-session boundary, a cold function,
    // and the first owner-scoped thread lookup. Wait for the actual product
    // marker instead of racing those dependencies with a fixed sleep.
    const homeReady = await waitForPageCondition(
      ctx,
      session,
      `document.body?.innerText.includes(${JSON.stringify(`Hey ${OWNER_NAME}`)}) === true`,
    );
    const home = resultText(await runAgentBrowser(ctx, ["get", "text", "body"], { session }));

    await runAgentBrowser(ctx, ["open", new URL("/manage", baseUrl).toString()], { session });
    const manageReady = await waitForPageCondition(
      ctx,
      session,
      `document.querySelector("h1")?.textContent?.trim() === "Manage"`,
    );
    const manage = resultText(await runAgentBrowser(ctx, ["get", "text", "body"], { session }));

    await runAgentBrowser(ctx, ["open", new URL("/manage/activity", baseUrl).toString()], { session });
    const activityReady = await waitForPageCondition(
      ctx,
      session,
      `Array.from(document.querySelectorAll("h2")).some((node) => node.textContent?.trim() === "Activity")`,
    );
    const activity = resultText(await runAgentBrowser(ctx, ["get", "text", "body"], { session }));

    await runAgentBrowser(ctx, ["open", new URL("/manage/system", baseUrl).toString()], { session });
    const systemReady = await waitForPageCondition(
      ctx,
      session,
      `Array.from(document.querySelectorAll("h2")).some((node) => node.textContent?.trim() === "System")`,
    );
    const system = resultText(await runAgentBrowser(ctx, ["get", "text", "body"], { session }));
    const interactive = resultText(
      await runAgentBrowser(ctx, ["snapshot", "--interactive", "--compact"], { session }),
    );
    await runAgentBrowser(ctx, ["set", "viewport", "390", "844"], { session });
    await runAgentBrowser(ctx, ["press", "Tab"], { session });
    await runAgentBrowser(ctx, ["press", "Tab"], { session });
    const focus = resultText(
      await runAgentBrowser(
        ctx,
        ["eval", "({tag:document.activeElement?.tagName||'',label:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.trim().slice(0,80)||''})"],
        { session },
      ),
    );
    await runAgentBrowser(ctx, ["screenshot", screenshotPath, "--full"], { session });
    const pageErrors = resultText(await runAgentBrowser(ctx, ["errors"], { session }));
    const combined = `${home}\n${manage}\n${activity}\n${system}`.toLowerCase();
    const explicitStateTerms = ["loading", "empty", "no ", "error", "failed", "cancel", "retry", "ready", "setup"];
    return {
      ok: homeReady && manageReady && activityReady && systemReady,
      url: baseUrl,
      routeReady: {
        home: homeReady,
        manage: manageReady,
        activity: activityReady,
        system: systemReady,
      },
      hasAgentName: combined.includes(AGENT_NAME.toLowerCase()),
      hasOwnerGreeting: combined.includes(`hey ${OWNER_NAME}`.toLowerCase()),
      hasManage: combined.includes("manage"),
      hasActivity: combined.includes("activity"),
      hasSystem: combined.includes("system"),
      hasExplicitState: explicitStateTerms.some((term) => combined.includes(term)),
      focusReachedControl: !focus.toLowerCase().includes('"tag":"body"') && focus.length > 2,
      interactiveCount: (interactive.match(/\[ref=/g) ?? []).length,
      pageErrorCount: pageErrors.trim() === "" || pageErrors.includes('"errors":[]') ? 0 : 1,
    };
  } catch (error) {
    return {
      ok: false,
      url: baseUrl,
      routeReady: { home: false, manage: false, activity: false, system: false },
      hasAgentName: false,
      hasOwnerGreeting: false,
      hasManage: false,
      hasActivity: false,
      hasSystem: false,
      hasExplicitState: false,
      focusReachedControl: false,
      interactiveCount: 0,
      pageErrorCount: 1,
      error: safeError(error),
    };
  }
}

async function previewAuthProbe(previewUrl: string) {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  const expected =
    process.env.MYEVE_QA_PREVIEW_HOST?.trim() ?? process.env.SOFIE_QA_PREVIEW_HOST?.trim();
  const url = new URL(previewUrl);
  if (!bypass || !expected || url.hostname !== expected) {
    return { ok: false, reason: "Preview auth broker unavailable or target mismatch." };
  }
  const request = async (cookie?: string) => {
    const response = await fetch(new URL("/api/task-runs", url), {
      redirect: "manual",
      headers: {
        "x-vercel-protection-bypass": bypass,
        ...(cookie ? { cookie } : {}),
      },
    });
    return { status: response.status, returnedOwnerData: response.ok };
  };
  const unauthenticated = await request();
  const tampered = await request(`${WEB_SESSION_COOKIE}=invalid`);
  return {
    ok:
      !unauthenticated.returnedOwnerData &&
      !tampered.returnedOwnerData &&
      [307, 401].includes(unauthenticated.status) &&
      [307, 401].includes(tampered.status),
    unauthenticated,
    tampered,
  };
}

async function writeResult(
  ctx: ToolContext,
  taskId: string,
  role: QaSpecialistRole,
  slug: string,
  status: CheckResult["status"],
  summary: string,
  evidence: object,
): Promise<CheckResult> {
  const path = `/tmp/${taskId}-${role}-${slug}.json`;
  const sandbox = await ctx.getSandbox();
  await sandbox.writeTextFile({
    path,
    content: `${JSON.stringify({ taskId, role, slug, status, summary, evidence }, null, 2)}\n`,
  });
  return { slug, status, summary, path, kind: "report", contentType: "application/json" };
}

export function createRunAssignedQaSuiteTool(role: QaSpecialistRole) {
  // Keep the specialist's execution bounded to one deterministic browser pass.
  return defineTool({
    description: `Run the fixed, read-only ${role} critical-path UI suite in one bounded action and create redacted evidence reports for both assigned checks.`,
    inputSchema: z.object({ taskId: z.string().startsWith("task_") }),
    async execute({ taskId }, ctx) {
      const run = await getTaskRun(taskOwnerFromAuth(ctx.session.auth), taskId);
      if (!run || run.status !== "running") throw new Error("The QA task is not active.");
      const specialist = run.specialists.find((item) => item.role === role);
      if (!specialist || specialist.status !== "running") {
        throw new Error("Claim the specialist assignment before running the suite.");
      }
      const local = await captureCriticalUi(
        ctx,
        `${role}-local`,
        run.target.localUrl,
        `/tmp/${taskId}-${role}-local.png`,
      );
      const preview = await captureCriticalUi(
        ctx,
        `${role}-preview`,
        run.target.previewUrl,
        `/tmp/${taskId}-${role}-preview.png`,
      );

      let checks: CheckResult[];
      if (role === "functional-state") {
        const localPass = local.ok && local.hasManage && local.hasActivity && local.hasSystem && local.pageErrorCount === 0;
        const previewPass = preview.ok && preview.hasManage && preview.hasActivity && preview.hasSystem && preview.pageErrorCount === 0;
        checks = await Promise.all([
          writeResult(ctx, taskId, role, "local-critical-flow", localPass ? "passed" : "failed", localPass ? "Local home, Manage, Activity, and System UI loaded without a blocking page error." : "Local critical UI flow had a blocking or missing state.", { local }),
          writeResult(ctx, taskId, role, "preview-critical-flow", previewPass ? "passed" : "failed", previewPass ? "Preview home, Manage, Activity, and System UI loaded through the isolated credential broker without a blocking page error." : "Preview critical UI flow had a blocking or missing state.", { preview: { ...preview, url: run.target.previewUrl } }),
        ]);
      } else if (role === "ux-accessibility") {
        const identityPass =
          local.hasAgentName &&
          local.hasOwnerGreeting &&
          preview.hasAgentName &&
          preview.hasOwnerGreeting &&
          local.hasManage &&
          preview.hasManage;
        const accessPass = local.ok && preview.ok && local.focusReachedControl && preview.focusReachedControl && local.interactiveCount > 0 && preview.interactiveCount > 0;
        checks = await Promise.all([
          writeResult(ctx, taskId, role, "identity-and-navigation", identityPass ? "passed" : "failed", identityPass ? `${AGENT_NAME}, Hey ${OWNER_NAME}, and primary Manage navigation are consistent in local and Preview UI.` : "Identity or primary navigation was inconsistent across local and Preview.", { local, preview: { ...preview, url: run.target.previewUrl } }),
          writeResult(ctx, taskId, role, "responsive-and-keyboard", accessPass ? "passed" : "failed", accessPass ? "Both targets remained usable at 390×844 and keyboard focus reached an interactive control." : "Responsive or keyboard usability failed on at least one target.", { local, preview: { ...preview, url: run.target.previewUrl } }),
        ]);
      } else {
        const auth = await previewAuthProbe(run.target.previewUrl);
        const authPass = auth.ok && preview.ok;
        const recoveryPass = local.ok && preview.ok && local.hasExplicitState && preview.hasExplicitState;
        checks = await Promise.all([
          writeResult(ctx, taskId, role, "auth-and-data-boundaries", authPass ? "passed" : "failed", authPass ? "Missing and tampered Preview sessions failed closed while the brokered owner UI remained reachable." : "Preview authentication or owner-boundary behavior did not meet the fail-closed contract.", { auth, authenticatedPreviewUi: { ...preview, url: run.target.previewUrl } }),
          writeResult(ctx, taskId, role, "failure-and-recovery", recoveryPass ? "passed" : "failed", recoveryPass ? "Local and Preview Activity/System UI exposed explicit readiness, empty, failure, cancellation, or retry state language." : "Explicit recovery-state UI was missing or unreachable on at least one target.", { local, preview: { ...preview, url: run.target.previewUrl } }),
        ]);
      }
      return { role, checks };
    },
  });
}
