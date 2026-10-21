import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { createAlphaTasksApi } from "../../../apps/eve/lib/myapps/alpha-tasks-api.ts";
import {
  authenticateWebPrincipal,
  createWebSessionToken,
  WEB_SESSION_COOKIE,
} from "../../../apps/eve/lib/web-auth.ts";
import { digest } from "../src/alpha-tasks/contracts.ts";

/** Real UI/API, signed synthetic sessions, ordinary-role PG and Docker supplied by the opt-in fixture. */
export async function qualifyAlphaTasksBrowser({ apps, human, pkg, output }) {
  await mkdir(output, { recursive: true });
  const app = resolve(import.meta.dirname, "../../../apps/eve");
  const require = createRequire(resolve(app, "package.json"));
  const env = {
    NODE_ENV: "production",
    MYEVE_OWNER_ID: human.ownerId,
    MYEVE_ACCESS_PASSWORD: "synthetic-primary-password",
    MYEVE_SESSION_SECRET:
      "synthetic-session-secret-for-local-qualification-only",
    MYEVE_PARTNER_OWNER_ID: "synthetic-other-browser-owner",
    MYEVE_PARTNER_ACCESS_PASSWORD: "synthetic-partner-password",
    MYEVE_DURABLE_WEB_SESSIONS: "false",
  };
  const api = createAlphaTasksApi(
    apps,
    async (owner) => ({ ...human, ownerId: owner, actorId: owner }),
    (request) => authenticateWebPrincipal(request, env),
  );
  const bundle = await build({
    stdin: {
      contents:
        "import React from 'react';import {createRoot} from 'react-dom/client';import {InstalledAlphaTasks} from './components/owner/installed-alpha-tasks';createRoot(document.getElementById('root')).render(<InstalledAlphaTasks/>);",
      resolveDir: app,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    outdir: "out",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    logLevel: "silent",
  });
  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text,
    css = bundle.outputFiles.find((file) => file.path.endsWith(".css")).text;
  let origin,
    readOutage = false,
    createBodies = [];
  const server = createServer(async (req, res) => {
    try {
      if (req.url === "/api/myapps/alpha") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString();
        const request = new Request(origin + req.url, {
          method: req.method,
          headers: req.headers,
          body: raw || undefined,
        });
        const input = JSON.parse(raw);
        if (readOutage && input.operation === "catalog") {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "APP_UNAVAILABLE" }));
          return;
        }
        const response = await api(request),
          body = await response.text();
        if (input.operation === "create") {
          createBodies.push(input);
        }
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(body);
        return;
      }
      res.setHeader(
        "content-type",
        req.url === "/app.js"
          ? "application/javascript"
          : req.url === "/app.css"
            ? "text/css"
            : "text/html",
      );
      res.end(
        req.url === "/app.js"
          ? js
          : req.url === "/app.css"
            ? css
            : '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Installed task apps qualification</title><link rel="stylesheet" href="/app.css"><style>:root{--font-geist:Arial}body{margin:0}</style></head><body><div id="root" class="owner-shell"></div><script src="/app.js"></script></body></html>',
      );
    } catch (error) {
      res.writeHead(500);
      res.end("Fixture request failed");
    }
  });
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  origin = "http://127.0.0.1:" + server.address().port;
  let browser, page;
  try {
    const token = createWebSessionToken(env),
      cookie = WEB_SESSION_COOKIE + "=" + token;
    const call = (body, headers = { cookie, origin }) =>
      fetch(origin + "/api/myapps/alpha", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal((await call({ operation: "catalog" }, {})).status, 401);
    assert.equal(
      (
        await call(
          { operation: "catalog" },
          { cookie, origin: "https://foreign.invalid" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          { operation: "catalog" },
          {
            cookie:
              WEB_SESSION_COOKIE +
              "=" +
              createWebSessionToken(env, Date.now() - 8 * 86400000),
            origin,
          },
        )
      ).status,
      401,
    );
    assert.equal(
      (await call({ operation: "catalog", ownerId: human.ownerId })).status,
      409,
    );
    const foreignCookie =
      WEB_SESSION_COOKIE +
      "=" +
      createWebSessionToken(env, Date.now(), env.MYEVE_PARTNER_OWNER_ID);
    assert.deepEqual(
      await (
        await call({ operation: "catalog" }, { cookie: foreignCookie, origin })
      ).json(),
      { apps: [] },
    );
    assert.equal(
      (
        await call(
          { operation: "preview", appId: pkg.appId, version: 1 },
          { cookie: foreignCookie, origin },
        )
      ).status,
      409,
    );
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let loseCreateResponse = true;
    await page.route("**/api/myapps/alpha", async (route) => {
      if (
        loseCreateResponse &&
        route.request().postDataJSON().operation === "create"
      ) {
        loseCreateResponse = false;
        const committed = await route.fetch();
        assert.equal(committed.ok(), true);
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await page.goto(origin);
    await page
      .getByText("Sign in to view your installed apps.", { exact: true })
      .waitFor();
    await page
      .context()
      .addCookies([
        {
          name: WEB_SESSION_COOKIE,
          value: token,
          url: origin,
          httpOnly: true,
          sameSite: "Strict",
        },
      ]);
    await page.reload();
    await page.getByText("No task apps ready yet", { exact: true }).waitFor();
    await apps.prepare(human, pkg);
    await page
      .getByRole("button", { name: "Refresh apps", exact: true })
      .click();
    async function install(version) {
      await page
        .getByRole("button", {
          name: "Preview release " + version,
          exact: true,
        })
        .click();
      await page
        .getByRole("heading", {
          name: "Release " + version + " preview",
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("button", { name: "Review installation", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Install release " + version + " privately",
          exact: true,
        })
        .click();
      await page
        .getByText("Release " + version + " · Enabled", { exact: true })
        .waitFor();
    }
    await install(1);
    await page.getByText("No tasks yet", { exact: true }).waitFor();
    await page
      .getByLabel("New task", { exact: true })
      .fill("Preserved after lost response");
    await page.getByRole("button", { name: "Add task", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: "Retry same request", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("New task", { exact: true }).isDisabled(),
      true,
    );
    await page
      .getByRole("button", { name: "Retry same request", exact: true })
      .click();
    await page.getByText("Task added.", { exact: true }).waitFor();
    await page.getByLabel("Task 1", { exact: true }).waitFor();
    assert.equal(createBodies.length, 2);
    assert.deepEqual(createBodies[0], createBodies[1]);
    assert.equal((await apps.catalog(human))[0].tasks.length, 1);
    await page
      .getByLabel("Task 1", { exact: true })
      .fill("Preserved through update and rollback");
    await page
      .getByLabel("Task 1 priority", { exact: true })
      .selectOption("High");
    await page
      .getByRole("checkbox", { name: "Completed", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Save task 1", exact: true })
      .click();
    await page.getByText("Task saved.", { exact: true }).waitFor();
    const saved = (await apps.catalog(human))[0].tasks;
    assert.deepEqual(saved, [
      {
        id: 1,
        title: "Preserved through update and rollback",
        done: true,
        priority: "High",
      },
    ]);
    const next = {
      ...pkg,
      version: 2,
      base: { version: 1, digest: digest(pkg) },
    };
    await apps.prepare(human, next);
    await page
      .getByRole("button", { name: "Refresh apps", exact: true })
      .click();
    await install(2);
    await page
      .getByRole("button", {
        name: "Prepare rollback to release 1",
        exact: true,
      })
      .click();
    await page
      .getByText(
        "Rollback release prepared. Preview the new release to continue.",
        { exact: true },
      )
      .waitFor();
    await install(3);
    assert.deepEqual((await apps.catalog(human))[0].tasks, saved);
    await page.getByRole("button", { name: "Pause app", exact: true }).click();
    await page.getByText("Release 3 · Paused", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Add task", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Enable app", exact: true }).click();
    await page.getByText("Release 3 · Enabled", { exact: true }).waitFor();
    const axe = await readFile(require.resolve("axe-core"), "utf8"),
      accessibility = [];
    for (const [name, width, height] of [
      ["desktop", 1280, 1000],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(axe);
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.filter((item) =>
          ["critical", "serious"].includes(item.impact),
        ),
      );
      assert.deepEqual(
        violations.map((item) => item.id),
        [],
      );
      accessibility.push({ name, violations });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      await page.screenshot({
        path: resolve(output, name + ".png"),
        fullPage: true,
      });
    }
    readOutage = true;
    await page.reload();
    await page
      .getByText(
        "This app is unavailable. Refresh its records before trying again.",
        { exact: true },
      )
      .waitFor();
    readOutage = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("Release 3 · Enabled", { exact: true }).waitFor();
    assert.deepEqual((await apps.catalog(human))[0].tasks, saved);
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(output, "receipt.json"),
      JSON.stringify(
        {
          status: "PASS",
          scope:
            "Actual React UI, canonical signed synthetic web sessions, real API, ordinary-role PostgreSQL and isolated Docker candidate; no installed user, Clerk, Factory or hosted qualification",
          checks: [
            "anonymous and expired session denial",
            "cross-origin denial",
            "body owner denied",
            "cross-owner catalog and preview denied",
            "empty",
            "preview and explicit inbox installation",
            "keyboard create",
            "post-commit response loss and same-request retry",
            "edit priority and completion",
            "update installation",
            "rollback preserves data",
            "pause and resume",
            "read outage and refresh",
            "browser reload retains state",
            "mobile and desktop overflow",
            "axe serious/critical",
          ],
          createRequests: createBodies.length,
          storedTasks: saved.length,
          missionId: pkg.origin.missionId,
          errors,
          accessibility,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (page) {
      await page.screenshot({
        path: resolve(output, "failure.png"),
        fullPage: true,
      });
      await writeFile(
        resolve(output, "failure.txt"),
        await page.locator("body").innerText(),
      );
    }
    throw error;
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
}
