import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  AppError,
  appId,
  canonical,
  digest,
  keys,
  requireValue,
  text,
  validatePackage,
} from "./contracts.ts";
import type { AppPackage } from "./contracts.ts";
import type { Lead } from "./crm.ts";

export interface Principal {
  ownerId: string;
  actorId: string;
  kind: "human" | "agent";
  /** Trusted authentication/policy adapter supplies this intersection; never a request body. */
  allowedOperations: string[];
}
export interface VersionRow {
  package: AppPackage;
  digest: string;
  state: "CANDIDATE" | "VERIFIED" | "REVOKED";
  proof: unknown | null;
}
export interface AppRow {
  appId: string;
  ownerId: string;
  installedVersion: number | null;
  installedDigest: string | null;
  enabled: boolean;
  revision: number;
  data: { schemaVersion: 1 | 2; leads: Record<string, Lead> };
}
export interface Verification {
  format: "myapps.verification.reference.v1";
  appDigest: string;
  candidateId: string;
  verifier: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  cleanupConfirmed: boolean;
  claims: string[];
}
const deny = () => {
  throw new AppError();
};

/** Local durable reference only. No production connection, database credentials or generated SQL. */
export class ReferenceStore {
  #db: DatabaseSync;
  #now: () => string;
  constructor(path = ":memory:", now = () => new Date().toISOString()) {
    this.#now = now;
    this.#db = new DatabaseSync(path, {
      timeout: 5000,
      enableForeignKeyConstraints: true,
      allowExtension: false,
    });
    this.#db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS apps(owner TEXT NOT NULL,id TEXT NOT NULL,intent TEXT NOT NULL,row TEXT NOT NULL, PRIMARY KEY(owner,id),UNIQUE(owner,intent));
      CREATE TABLE IF NOT EXISTS versions(owner TEXT NOT NULL,app TEXT NOT NULL,version INTEGER NOT NULL,row TEXT NOT NULL,PRIMARY KEY(owner,app,version),FOREIGN KEY(owner,app) REFERENCES apps(owner,id));
      CREATE TABLE IF NOT EXISTS receipts(owner TEXT NOT NULL,app TEXT NOT NULL,key TEXT NOT NULL,request TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(owner,app,key));
      CREATE TABLE IF NOT EXISTS approvals(owner TEXT NOT NULL,app TEXT NOT NULL,id TEXT NOT NULL,row TEXT NOT NULL,PRIMARY KEY(owner,app,id));
      CREATE TABLE IF NOT EXISTS previews(owner TEXT NOT NULL,app TEXT NOT NULL,id TEXT NOT NULL,row TEXT NOT NULL,PRIMARY KEY(owner,app,id));
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,owner TEXT NOT NULL,app TEXT NOT NULL,row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS controls(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL,mutations INTEGER NOT NULL);
      INSERT OR IGNORE INTO controls VALUES(1,1,1);`);
  }
  close() {
    this.#db.close();
  }
  #atomic<T>(fn: () => T): T {
    // Host-only composition keeps resolution, action and response receipt in one transaction.
    if (this.#db.isTransaction) return fn();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }
  #app(owner: string, id: string): AppRow {
    const record = this.#db
      .prepare("SELECT row FROM apps WHERE owner=? AND id=?")
      .get(owner, id);
    if (!record) return deny();
    return JSON.parse(String(record.row));
  }
  #version(owner: string, id: string, version: number): VersionRow {
    this.#app(owner, id);
    const record = this.#db
      .prepare("SELECT row FROM versions WHERE owner=? AND app=? AND version=?")
      .get(owner, id, version);
    if (!record) return deny();
    return JSON.parse(String(record.row));
  }
  #save(row: AppRow) {
    this.#db
      .prepare("UPDATE apps SET row=? WHERE owner=? AND id=?")
      .run(canonical(row), row.ownerId, row.appId);
  }
  #saveVersion(owner: string, id: string, row: VersionRow) {
    this.#db
      .prepare(
        "UPDATE versions SET row=? WHERE owner=? AND app=? AND version=?",
      )
      .run(canonical(row), owner, id, row.package.version);
  }
  #event(
    owner: string,
    id: string,
    action: string,
    actor: string,
    version: number | null,
    outcome = "SUCCEEDED",
  ) {
    this.#db.prepare("INSERT INTO events(owner,app,row) VALUES(?,?,?)").run(
      owner,
      id,
      canonical({
        ownerId: owner,
        appId: id,
        version,
        action,
        actor,
        timestamp: this.#now(),
        effectClass: "internal-app-state",
        outcome,
      }),
    );
  }
  #permission(principal: Principal, operation: string) {
    text(principal.ownerId);
    text(principal.actorId);
    if (!principal.allowedOperations.includes(operation)) deny();
  }
  /** Trusted controller only; not part of the owner/agent interface. */
  register(creationIntent: string, value: unknown): VersionRow {
    const pkg = validatePackage(value),
      owner = pkg.spec.ownerId,
      id = appId(owner, creationIntent);
    requireValue(id === pkg.appId, "APP_ID_BINDING");
    const hash = digest(pkg);
    return this.#atomic(() => {
      const existingApp = this.#db
        .prepare("SELECT row FROM apps WHERE owner=? AND id=?")
        .get(owner, id);
      if (!existingApp) {
        requireValue(pkg.version === 1, "APP_BASE_MISSING");
        const row: AppRow = {
          ownerId: owner,
          appId: id,
          installedVersion: null,
          installedDigest: null,
          enabled: false,
          revision: 0,
          data: { schemaVersion: 1, leads: {} },
        };
        this.#db
          .prepare("INSERT INTO apps VALUES(?,?,?,?)")
          .run(owner, id, creationIntent, canonical(row));
      }
      const existing = this.#db
        .prepare(
          "SELECT row FROM versions WHERE owner=? AND app=? AND version=?",
        )
        .get(owner, id, pkg.version);
      if (existing) {
        const row = JSON.parse(String(existing.row));
        requireValue(row.digest === hash, "APP_VERSION_IMMUTABLE");
        return row;
      }
      const latest = this.#db
        .prepare(
          "SELECT MAX(version) AS version FROM versions WHERE owner=? AND app=?",
        )
        .get(owner, id);
      requireValue(
        pkg.version === Number(latest?.version ?? 0) + 1,
        "APP_VERSION_SEQUENCE",
      );
      if (pkg.base) {
        const base = this.#version(owner, id, pkg.base.version);
        // Revocation denies execution, not immutable lineage for a separately approved repair.
        requireValue(base.digest === pkg.base.digest, "APP_BASE_MISMATCH");
      }
      const row: VersionRow = {
        package: pkg,
        digest: hash,
        state: "CANDIDATE",
        proof: null,
      };
      this.#db
        .prepare("INSERT INTO versions VALUES(?,?,?,?)")
        .run(owner, id, pkg.version, canonical(row));
      this.#event(
        owner,
        id,
        "candidate.created",
        "factory-controller",
        pkg.version,
      );
      return row;
    });
  }
  /** Accept only a trusted independent verifier result; never exposed over the App API. */
  recordVerification(
    owner: string,
    id: string,
    version: number,
    result: Verification,
  ): VersionRow {
    keys(result, [
      "format",
      "appDigest",
      "candidateId",
      "verifier",
      "status",
      "cleanupConfirmed",
      "claims",
    ]);
    requireValue(
      result.format === "myapps.verification.reference.v1" &&
        typeof result.cleanupConfirmed === "boolean" &&
        ["PASS", "FAIL", "UNKNOWN"].includes(result.status),
    );
    text(result.verifier);
    requireValue(
      Array.isArray(result.claims) &&
        result.claims.every((c) => typeof c === "string"),
    );
    return this.#atomic(() => {
      const row = this.#version(owner, id, version);
      requireValue(
        result.appDigest === row.digest &&
          result.candidateId === row.package.source.candidateId,
        "VERIFIER_BINDING",
      );
      const proof = {
        result,
        ownerId: owner,
        work: row.package.work,
        appId: id,
        version,
        appDigest: row.digest,
        appSpecDigest: digest(row.package.spec),
        skills: row.package.spec.skills,
        factoryVersion: row.package.factoryVersion,
        publication: "NOT_PUBLISHED",
        installation: "NOT_INSTALLED",
        established:
          result.status === "PASS" && result.cleanupConfirmed
            ? result.claims
            : [],
        unestablished: [
          "production-integration",
          "live-model-execution",
          "publication",
          "installation",
          "owner-acceptance",
        ],
      };
      if (row.proof) {
        requireValue(
          canonical(row.proof) === canonical(proof),
          "VERIFIER_RESULT_IMMUTABLE",
        );
        return row;
      }
      requireValue(row.state === "CANDIDATE", "APP_UNAVAILABLE");
      row.proof = proof;
      if (result.status === "PASS" && result.cleanupConfirmed)
        row.state = "VERIFIED";
      this.#saveVersion(owner, id, row);
      this.#event(
        owner,
        id,
        "verification.completed",
        result.verifier,
        version,
        result.status,
      );
      return row;
    });
  }
  /** Trusted preview host binds a fixed candidate and expiry, with a separate temporary data store. */
  createPreview(owner: string, id: string, version: number) {
    return this.#atomic(() => {
      const candidate = this.#version(owner, id, version);
      requireValue(candidate.state === "VERIFIED", "APP_UNAVAILABLE");
      const preview = {
        id: randomUUID(),
        appDigest: candidate.digest,
        version,
        expiresAt: new Date(Date.parse(this.#now()) + 3600_000).toISOString(),
        revoked: false,
      };
      this.#db
        .prepare("INSERT INTO previews VALUES(?,?,?,?)")
        .run(owner, id, preview.id, canonical(preview));
      this.#event(owner, id, "preview.created", "preview-controller", version);
      return preview;
    });
  }
  #preview(owner: string, id: string, previewId: string) {
    this.#app(owner, id);
    const record = this.#db
      .prepare("SELECT row FROM previews WHERE owner=? AND app=? AND id=?")
      .get(owner, id, previewId);
    if (!record) return deny();
    const row = JSON.parse(String(record.row));
    const version = this.#version(owner, id, row.version);
    if (
      row.revoked ||
      Date.parse(row.expiresAt) <= Date.parse(this.#now()) ||
      version.state !== "VERIFIED"
    )
      deny();
    return row;
  }
  controls(enabled: boolean, mutations: boolean) {
    requireValue(
      typeof enabled === "boolean" && typeof mutations === "boolean",
    );
    this.#atomic(() =>
      this.#db
        .prepare("UPDATE controls SET enabled=?,mutations=? WHERE id=1")
        .run(Number(enabled), Number(mutations)),
    );
  }
  conversation<T>(
    principal: Principal,
    requestId: string,
    request: string,
    handler: () => T,
  ): T {
    this.#permission(principal, "apps.read");
    text(requestId);
    text(request, 1000);
    return this.#atomic(() => {
      const hash = digest({
        request,
        actor: principal.actorId,
        kind: principal.kind,
      });
      const prior = this.#db
        .prepare(
          "SELECT request,response FROM receipts WHERE owner=? AND app=? AND key=?",
        )
        .get(principal.ownerId, "@conversation", requestId);
      if (prior) {
        requireValue(prior.request === hash, "IDEMPOTENCY_CONFLICT");
        const response = JSON.parse(String(prior.response));
        if (response.target?.appId) {
          const target = response.target,
            app = this.#app(principal.ownerId, target.appId);
          this.#permission(principal, target.operation);
          const controls = this.#db
            .prepare("SELECT * FROM controls WHERE id=1")
            .get()!;
          if (
            !controls.enabled ||
            !app.enabled ||
            app.installedVersion !== target.version ||
            app.installedDigest !== target.digest ||
            this.#version(principal.ownerId, target.appId, target.version)
              .state !== "VERIFIED"
          )
            deny();
        }
        return response;
      }
      const result = handler();
      this.#db
        .prepare("INSERT INTO receipts VALUES(?,?,?,?,?)")
        .run(
          principal.ownerId,
          "@conversation",
          requestId,
          hash,
          canonical(result),
        );
      return result;
    });
  }
  revoke(owner: string, id: string, version: number) {
    return this.#atomic(() => {
      const row = this.#version(owner, id, version);
      row.state = "REVOKED";
      this.#saveVersion(owner, id, row);
      const app = this.#app(owner, id);
      if (app.installedVersion === version) app.enabled = false;
      app.revision++;
      this.#save(app);
      this.#event(owner, id, "version.revoked", "platform-controller", version);
    });
  }
  /** Facade contains no verifier, package-registration, SQL or operator methods. */
  session(input: Principal) {
    const principal = structuredClone(input),
      owner = text(principal.ownerId);
    const permitted = (operation: string) =>
      this.#permission(principal, operation);
    return {
      list: (): AppRow[] => {
        permitted("apps.read");
        return this.#db
          .prepare("SELECT row FROM apps WHERE owner=? ORDER BY id")
          .all(owner)
          .map((r) => {
            const app = JSON.parse(String(r.row));
            return { ...app, data: { schemaVersion: 1, leads: {} } };
          });
      },
      get: (id: string) => {
        permitted("apps.read");
        const row = this.#app(owner, id);
        return { ...row, data: { schemaVersion: 1 as const, leads: {} } };
      },
      version: (id: string, version: number) => {
        permitted("apps.read");
        return this.#version(owner, id, version);
      },
      history: (id: string) => {
        permitted("apps.read");
        this.#app(owner, id);
        return this.#db
          .prepare(
            "SELECT row FROM events WHERE owner=? AND app=? ORDER BY seq",
          )
          .all(owner, id)
          .map((r) => JSON.parse(String(r.row)));
      },
      preview: (id: string, previewId: string) => {
        permitted("apps.read");
        return this.#preview(owner, id, previewId);
      },
      terminatePreview: (id: string, previewId: string) => {
        permitted("apps.manage");
        return this.#atomic(() => {
          const preview = this.#preview(owner, id, previewId);
          preview.revoked = true;
          this.#db
            .prepare(
              "UPDATE previews SET row=? WHERE owner=? AND app=? AND id=?",
            )
            .run(canonical(preview), owner, id, previewId);
        });
      },
      requestInstall: (id: string, previewId: string) => {
        permitted("apps.manage");
        return this.#atomic(() => {
          const preview = this.#preview(owner, id, previewId),
            app = this.#app(owner, id);
          const approval = {
            id: digest({ previewId, revision: app.revision }),
            version: preview.version,
            digest: preview.appDigest,
            previewId,
            revision: app.revision,
            consumed: false,
          };
          this.#db
            .prepare("INSERT OR IGNORE INTO approvals VALUES(?,?,?,?)")
            .run(owner, id, approval.id, canonical(approval));
          return approval;
        });
      },
      approveInstall: (id: string, approvalId: string) => {
        permitted("apps.install");
        if (principal.kind !== "human") deny();
        return this.#atomic(() => {
          const app = this.#app(owner, id);
          const saved = this.#db
            .prepare(
              "SELECT row FROM approvals WHERE owner=? AND app=? AND id=?",
            )
            .get(owner, id, approvalId);
          if (!saved) return deny();
          const approval = JSON.parse(String(saved.row));
          if (approval.consumed)
            return {
              version: approval.version,
              digest: approval.digest,
              duplicate: true,
            };
          this.#preview(owner, id, approval.previewId);
          const candidate = this.#version(owner, id, approval.version);
          requireValue(
            candidate.state === "VERIFIED" &&
              candidate.digest === approval.digest &&
              app.revision === approval.revision,
            "INSTALLATION_STALE",
          );
          requireValue(
            candidate.package.base === null
              ? app.installedVersion === null
              : candidate.package.base.version === app.installedVersion &&
                  candidate.package.base.digest === app.installedDigest,
            "INSTALLATION_BASE_MISMATCH",
          );
          requireValue(
            app.data.schemaVersion === candidate.package.migration.fromSchema,
            "MIGRATION_FAILED",
          );
          // Reviewed additive migration and installation commit together; rollback retains newer fields.
          if (candidate.package.migration.kind === "add-priority") {
            for (const lead of Object.values(app.data.leads))
              lead.priority = null;
            app.data.schemaVersion = 2;
          }
          app.installedVersion = approval.version;
          app.installedDigest = approval.digest;
          app.enabled = true;
          app.revision++;
          this.#save(app);
          approval.consumed = true;
          this.#db
            .prepare(
              "UPDATE approvals SET row=? WHERE owner=? AND app=? AND id=?",
            )
            .run(canonical(approval), owner, id, approvalId);
          this.#event(
            owner,
            id,
            "app.installed",
            principal.actorId,
            app.installedVersion,
          );
          return {
            version: approval.version,
            digest: approval.digest,
            duplicate: false,
          };
        });
      },
      setEnabled: (id: string, enabled: boolean, expectedRevision: number) => {
        permitted("apps.manage");
        requireValue(typeof enabled === "boolean");
        return this.#atomic(() => {
          const app = this.#app(owner, id);
          requireValue(
            app.revision === expectedRevision && app.installedVersion !== null,
            "APP_REVISION_CONFLICT",
          );
          if (enabled)
            requireValue(
              this.#version(owner, id, app.installedVersion).state ===
                "VERIFIED",
              "APP_UNAVAILABLE",
            );
          app.enabled = enabled;
          app.revision++;
          this.#save(app);
          this.#event(
            owner,
            id,
            enabled ? "app.enabled" : "app.disabled",
            principal.actorId,
            app.installedVersion,
          );
          return app.revision;
        });
      },
    };
  }
  /** Trusted typed runtime calls this boundary, never generated code or browser-authored callbacks. */
  operate<T>(
    principal: Principal,
    id: string,
    version: number,
    hash: string,
    operation: string,
    write: boolean,
    input: unknown,
    key: string | null,
    handler: (app: AppRow, timestamp: string, spec: AppPackage["spec"]) => T,
  ): T {
    this.#permission(principal, operation);
    return this.#atomic(() => {
      const app = this.#app(principal.ownerId, id),
        candidate = this.#version(principal.ownerId, id, version);
      const controls = this.#db
        .prepare("SELECT * FROM controls WHERE id=1")
        .get()!;
      if (
        !controls.enabled ||
        (write && !controls.mutations) ||
        !app.enabled ||
        candidate.state !== "VERIFIED" ||
        app.installedVersion !== version ||
        app.installedDigest !== hash
      )
        deny();
      const operations = write
        ? candidate.package.spec.actions
        : candidate.package.spec.queries;
      if (!operations.some((op) => op.name === operation)) deny();
      const request = digest({
        operation,
        input,
        actor: principal.actorId,
        kind: principal.kind,
        version,
        hash,
      });
      if (write) {
        text(key);
        const prior = this.#db
          .prepare(
            "SELECT request,response FROM receipts WHERE owner=? AND app=? AND key=?",
          )
          .get(principal.ownerId, id, key!);
        if (prior) {
          requireValue(prior.request === request, "IDEMPOTENCY_CONFLICT");
          return JSON.parse(String(prior.response));
        }
      }
      const output = handler(app, this.#now(), candidate.package.spec);
      if (write) {
        this.#save(app);
        this.#db
          .prepare("INSERT INTO receipts VALUES(?,?,?,?,?)")
          .run(principal.ownerId, id, key!, request, canonical(output));
      }
      this.#event(principal.ownerId, id, operation, principal.actorId, version);
      return structuredClone(output);
    });
  }
}
