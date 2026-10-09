import { beforeAll, afterAll, test, expect } from "vitest";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { WorkStore } from "../../../apps/eve/lib/engineering/store.ts";
import {
  loadMigrations,
  runMigrations,
} from "../../../apps/eve/scripts/migration-runner.ts";
import { ReferenceStore } from "../src/store.ts";
import { Crm } from "../src/crm.ts";
import { appId, leadCrmSpec, digest } from "../src/contracts.ts";
import { sofieRequest } from "../src/resolver.ts";
import { LEAD_CRM_REQUEST, proposeApp } from "../src/intent.ts";
import { previewSnapshot } from "../src/preview.ts";
import type { AppPackage, WorkBinding } from "../src/contracts.ts";
const connection = process.env.MYAPPS_POSTGRES_URL,
  factoryRoot = process.env.MYFACTORY_SOURCE_ROOT;
const pg = createRequire(import.meta.url)("pg");
let admin: any,
  pool: any,
  workStore: WorkStore,
  directory: string,
  factory: any;
const name = "myapps_" + randomUUID().replaceAll("-", ""),
  owner = "synthetic-owner-a";
// Trusted owner-approved admissions are independent of the producer's package.
const admissions = new Map<string, string>();
const database = (pool: any) => ({
  query: async (sql: string, params?: unknown[]) =>
    (await pool.query(sql, params)).rows,
  transaction: async (statements: { sql: string; params?: unknown[] }[]) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      for (const s of statements) await c.query(s.sql, s.params);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  },
});
beforeAll(async () => {
  if (!connection || !factoryRoot) return;
  const url = new URL(connection);
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw Error("LOCAL_TEST_DATABASE_REQUIRED");
  admin = new pg.Pool({ connectionString: connection });
  await admin.query("CREATE DATABASE " + name);
  url.pathname = "/" + name;
  pool = new pg.Pool({ connectionString: url.href, max: 4 });
  await runMigrations(database(pool), await loadMigrations(), () => {});
  workStore = new WorkStore(
    { scopeId: owner, scopeKind: "personal", actorId: owner },
    database(pool),
  );
  directory = mkdtempSync(join(tmpdir(), "myapps-golden-"));
  const { AppReferenceController } = await import(
    pathToFileURL(
      resolve(factoryRoot, "packages/app-builder/src/myapps/controller.mjs"),
    ).href
  );
  factory = await AppReferenceController.open({
    myeveRoot: process.cwd(),
    custodyDirectory: join(directory, "custody"),
    authorize: async ({
      work: binding,
      appDigest,
    }: {
      work: WorkBinding;
      appDigest: string;
    }) => {
      if (binding.ownerId !== owner) return false;
      if (admissions.get(binding.workId) !== appDigest) return false;
      const work = await workStore.get(binding.workId);
      return (
        work.version === binding.workVersion &&
        work.generation === binding.workGeneration &&
        work.lifecycle === "active" &&
        work.control === "agent"
      );
    },
  });
});
afterAll(async () => {
  factory?.close();
  if (directory) rmSync(directory, { recursive: true });
  await pool?.end();
  if (admin) {
    // pg.Pool.end() can resolve before PostgreSQL observes every socket close.
    // Wait for owned sessions to leave; never terminate them with a forced drop.
    let remaining: { pid: number }[] = [];
    for (let attempt = 0; attempt < 100; attempt++) {
      remaining = (await admin.query(
        "SELECT pid FROM pg_stat_activity WHERE datname=$1",
        [name],
      )).rows;
      if (remaining.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(remaining, "Golden Journey database sessions must close before cleanup").toEqual([]);
    await admin.query("DROP DATABASE IF EXISTS " + name);
    await admin.end();
  }
});

test.skipIf(!connection || !factoryRoot)(
  "canonical PostgreSQL Work -> Factory -> verifier -> Result -> preview -> owner install -> UI/agent state -> successor update",
  async () => {
    const { EMPTY_APP_SOURCE_COMMIT } = await import(
      pathToFileURL(
        resolve(factoryRoot!, "packages/app-builder/src/myapps/controller.mjs"),
      ).href
    );
    const { appResult, verifyAppResult, referenceConfiguration } = await import(
      pathToFileURL(
        resolve(factoryRoot!, "packages/app-builder/src/myapps/result.mjs"),
      ).href
    );
    const { fixturePrincipal, startPrototype } =
      await import("../prototype/server.mjs");
    const { chromium } = await import("playwright");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const issuedAt = "2026-10-08T12:00:00.000Z",
      keys = [
        {
          factoryId: "myapps-reference-factory",
          keyId: "fixture-key",
          publicKey: publicKey.export({ type: "spki", format: "pem" }),
          activeFrom: "2026-10-08T00:00:00.000Z",
          notAfter: "2026-10-09T00:00:00.000Z",
        },
      ];
    const factoryCommit = execFileSync(
      "git",
      ["-C", factoryRoot!, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim();
    const store = new ReferenceStore(
        join(directory, "apps.sqlite"),
        () => issuedAt,
      ),
      principal = fixturePrincipal(owner),
      session = store.session(principal),
      intent = "crm-request-1";
    let browser: any, server: any;
    const makeWork = async (title: string) => {
      const input = {
        title,
        objective: title,
        repository: "synthetic/app-package",
        criteria: [
          {
            id: randomUUID(),
            statement: "Verify exact App candidate and shared state",
            method: "test",
          },
        ],
        maxCostUsd: 0.01,
        maxDurationSeconds: 180,
        idempotencyKey: randomUUID(),
      };
      const [first, second] = await Promise.all([
        workStore.create(input),
        workStore.create(input),
      ]);
      expect(first.work.id).toBe(second.work.id);
      await workStore.change(first.work.id, {
        operation: "resume",
        expectedVersion: first.work.version,
      });
      return workStore.get(first.work.id);
    };
    try {
      const proposal = proposeApp(owner, LEAD_CRM_REQUEST);
      expect(proposal.status).toBe("PROPOSED");
      if (proposal.status !== "PROPOSED") throw Error("APP_INTENT_UNMATCHED");
      expect(proposal.skills).toEqual([]);
      const work = await makeWork(proposal.objective);
      const pkg: AppPackage = {
        format: "myeve.app-package.reference.v1",
        appId: appId(owner, intent),
        version: 1,
        spec: proposal.spec,
        work: {
          ownerId: owner,
          workId: work.id,
          workVersion: work.version,
          workGeneration: work.generation,
        },
        source: {
          repositoryCommit: EMPTY_APP_SOURCE_COMMIT,
          template: "lead-crm.v1",
          candidateId: "synthetic-crm-candidate-1",
        },
        factoryVersion: {
          sourceCommit: factoryCommit,
          configurationDigest: digest(referenceConfiguration(process.cwd())),
        },
        base: null,
        migration: { kind: "identity", fromSchema: 1, toSchema: 1 },
      };
      const qualify = async (candidate: AppPackage) => {
        admissions.set(candidate.work.workId, digest(candidate));
        const run = await factory.build({
          creationIntent: intent,
          pkg: candidate,
        });
        const verification = await factory.verify(owner, run.id);
        expect(verification.status).toBe("PASS");
        const { basePackage } = factory.readCandidate(owner, run.id);
        const signed = appResult({
          pkg: candidate,
          basePackage,
          run,
          verification,
          privateKey,
          keyId: "fixture-key",
          issuedAt,
        });
        const accepted = verifyAppResult({
          signed,
          pkg: candidate,
          run,
          keys,
          now: Date.parse(issuedAt),
        });
        store.register(intent, candidate);
        store.recordVerification(
          owner,
          candidate.appId,
          candidate.version,
          accepted.verification,
        );
        // Duplicate Factory Result cannot create another version or change historical Proof.
        store.recordVerification(
          owner,
          candidate.appId,
          candidate.version,
          verifyAppResult({
            signed,
            pkg: candidate,
            run,
            keys,
            now: Date.parse(issuedAt),
          }).verification,
        );
        return {
          run,
          signed,
          manifest: accepted.manifest,
          preview: store.createPreview(
            owner,
            candidate.appId,
            candidate.version,
          ),
        };
      };
      const first = await qualify(pkg);
      const shown = previewSnapshot(
        store,
        principal,
        pkg.appId,
        first.preview.id,
        intent,
        "2026-10-08",
      );
      expect(shown.leads).toHaveLength(3);
      expect(session.get(pkg.appId).installedVersion).toBeNull();
      const candidates = [
        {
          ownerId: owner,
          appId: pkg.appId,
          version: 1,
          previewId: first.preview.id,
        },
      ];
      server = await startPrototype({ store, candidates });
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: 1280, height: 960 },
      });
      page.setDefaultTimeout(10000);
      const click = async (name: string) =>
        page.getByRole("button", { name, exact: true }).click();
      await page.goto(server.origin);
      await click("Enter workspace");
      await click("Preview App");
      await click("Review installation");
      await click("Install App");
      await click("Open Lead CRM");
      const crm = new Crm(store, principal),
        hash = digest(pkg);
      await click("Add lead");
      for (const [label, value] of [
        ["Lead name", "Alex Morgan"],
        ["Company", "Acme"],
        ["Contact information", "alex@example.invalid"],
        ["Source", "Conference"],
        ["Pipeline value ($)", "5000"],
      ])
        await page.getByLabel(label, { exact: true }).fill(value);
      await click("Create lead");
      await page
        .getByRole("heading", { name: "Contact and opportunity" })
        .waitFor();
      const [lead] = crm.query(pkg.appId, 1, hash, "listLeads", {});
      const answer = sofieRequest(
        store,
        fixturePrincipal(owner, "agent"),
        "turn-1",
        "Move Acme to Proposal.",
        "2026-10-08",
      );
      expect(answer.status).toBe("ANSWER");
      expect(
        crm.query(pkg.appId, 1, hash, "getLead", { leadId: lead.id }).stage,
      ).toBe("Proposal");
      await click("Refresh");
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLSelectElement>('select[name="stage"]')
            ?.value === "Proposal",
      );
      const updateIntent = sofieRequest(
        store,
        fixturePrincipal(owner, "agent"),
        "update-intent",
        "Add a Lead Source report.",
        "2026-10-08",
      );
      expect(updateIntent.status).toBe("WORK_REQUIRED");
      expect(updateIntent.target).toMatchObject({
        appId: pkg.appId,
        version: 1,
        digest: hash,
      });
      const updateWork = await makeWork("Add a Lead Source report.");
      const next: AppPackage = {
        ...pkg,
        version: 2,
        spec: leadCrmSpec(owner, true),
        work: {
          ownerId: owner,
          workId: updateWork.id,
          workVersion: updateWork.version,
          workGeneration: updateWork.generation,
        },
        source: {
          ...pkg.source,
          repositoryCommit: first.run.candidateCommit,
          candidateId: "synthetic-crm-candidate-2",
        },
        base: { version: 1, digest: hash },
      };
      const second = await qualify(next);
      expect(session.get(pkg.appId).installedVersion).toBe(1);
      candidates.push({
        ownerId: owner,
        appId: pkg.appId,
        version: 2,
        previewId: second.preview.id,
      });
      await click("Apps");
      await click("Preview update");
      await page
        .getByRole("button", { name: "Lead Sources", exact: true })
        .click();
      await page.getByRole("heading", { name: "Lead source report" }).waitFor();
      await click("Review installation");
      const output = resolve("output/playwright/myapps");
      await page
        .getByRole("heading", { name: "Update Lead CRM", exact: true })
        .waitFor();
      mkdirSync(output, { recursive: true });
      const approvalImage = await page.screenshot({
        path: join(output, "golden-update-approval.png"),
        fullPage: true,
        animations: "disabled",
        caret: "hide",
      });
      if (process.env.MYAPPS_VISUAL_BASELINE_ROOT)
        expect(
          approvalImage.equals(
            readFileSync(
              join(
                process.env.MYAPPS_VISUAL_BASELINE_ROOT,
                "golden-update-approval.png",
              ),
            ),
          ),
        ).toBe(true);
      await click("Approve update");
      await click("Open Lead CRM");
      await click("Lead Sources");
      await page.getByRole("heading", { name: "Lead source report" }).waitFor();
      expect(
        crm.query(pkg.appId, 2, digest(next), "getLead", { leadId: lead.id })
          .stage,
      ).toBe("Proposal");
      expect(session.version(pkg.appId, 1).package).toEqual(pkg);
      expect(session.version(pkg.appId, 1).proof.installation).toBe(
        "NOT_INSTALLED",
      );
      expect(await workStore.list()).toHaveLength(2);
      await workStore.change(updateWork.id, {
        operation: "pause",
        expectedVersion: updateWork.version,
      });
      await expect(factory.verify(owner, second.run.id)).rejects.toThrow(
        "AUTHORITY_DENIED",
      );
      await page.screenshot({
        path: join(output, "golden-updated-crm.png"),
        fullPage: true,
      });
      const axePath = createRequire(import.meta.url).resolve("axe-core", {
        paths: [resolve("apps/eve")],
      });
      await page.evaluate(readFileSync(axePath, "utf8"));
      const violations = await page.evaluate(async () =>
        (await (window as any).axe.run(document)).violations.filter((v: any) =>
          ["critical", "serious"].includes(v.impact),
        ),
      );
      expect(violations.map((v: any) => v.id)).toEqual([]);
      await click("Apps");
      await page
        .getByRole("heading", { name: "Your Apps", exact: true })
        .waitFor();
      expect(
        await page
          .getByRole("button", { name: "Preview update", exact: true })
          .count(),
      ).toBe(0);
      writeFileSync(
        join(output, "golden.json"),
        JSON.stringify(
          {
            status: "PASS",
            canonicalWork: "PostgreSQL WorkStore with canonical migrations",
            appId: pkg.appId,
            versions: [
              { version: 1, digest: hash },
              { version: 2, digest: digest(next) },
            ],
            factoryVersion: pkg.factoryVersion,
            resultFactoryVersion: first.manifest.execution.factoryVersion,
            paidOperations: 0,
            productionDeployments: 0,
            productionInstallations: 0,
            externalAlphaChanges: 0,
            referenceOnly: true,
            stalePreviewSuppression: "PASS",
          },
          null,
          2,
        ) + "\n",
      );
      // Preserve only synthetic, public-verifiable evidence; private signing keys stay in memory.
      writeFileSync(
        join(output, "golden-artifacts.json"),
        JSON.stringify(
          {
            referenceOnly: true,
            packages: [pkg, next],
            runs: [first.run, second.run],
            results: [first.signed, second.signed],
            publicVerificationKeys: keys,
            proofs: [
              session.version(pkg.appId, 1).proof,
              session.version(pkg.appId, 2).proof,
            ],
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      await browser?.close();
      await server?.close();
      store.close();
    }
  },
);
