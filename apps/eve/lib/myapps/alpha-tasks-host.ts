import type { GoalPool } from "../goal-work/database.ts";
import { assertCapabilityAdmission } from "../../../../packages/capability-enforcement/src/postgres.ts";
import { requireValue } from "../../../../packages/myapps/src/contracts.ts";
import {
  canonical,
  digest,
  validateRuntime,
  type AlphaTasksPackage,
  type RuntimeProfile,
  isOwnerFactoryOrigin,
} from "../../../../packages/myapps/src/alpha-tasks/contracts.ts";
import { LocalAlphaTasksIsolation } from "../../../../packages/myapps/src/alpha-tasks/isolation.ts";
import type { SourceClosure } from "../../../../packages/myapps/src/alpha-tasks/source.ts";
import {
  retainedAlphaTasksOrigin,
  type AlphaTasksCustody,
} from "./alpha-tasks-result.ts";
import { AlphaTasksApps, type AlphaTasksHost } from "./alpha-tasks.ts";
import {retainedOwnerTasksOrigin,type OwnerFactoryTasksCustody} from './owner-tasks-result.ts';

/** Explicit local composition only. These registrations are operator inputs, not API bodies.
 * Actual private profile/runtime qualification is NOT established by creating this object. */
export function composeLocalAlphaTasks(
  pool: GoalPool,
  input: {
    runtimeId: string;
    target: string;
    installationId: string;
    agentId: string;
    custody: AlphaTasksCustody | OwnerFactoryTasksCustody;
    profiles: RuntimeProfile[];
    source: (pkg: AlphaTasksPackage) => Promise<SourceClosure>;
    env?: NodeJS.ProcessEnv;
  },
) {
  const env = input.env ?? process.env;
  const enabled = () =>
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL &&
    env.NODE_ENV !== "production" &&
    !env.VERCEL &&
    env.MYAPPS_LOCAL_INTEGRATION === "1";
  requireValue(
    enabled() && input.profiles.length > 0 && input.profiles.length <= 8,
    "APP_PRODUCTION_DISABLED",
  );
  const profiles = new Map(
    input.profiles.map((p) => {
      validateRuntime(p);
      return [digest(p), new LocalAlphaTasksIsolation(p)] as const;
    }),
  );
  const host: AlphaTasksHost = {
    runtimeId: input.runtimeId,
    target: input.target,
    enabled,
    assertProfile: (pkg) => {
      requireValue(
        profiles.has(digest(pkg.runtime)),
        "APP_RUNTIME_UNQUALIFIED",
      );
    },
    async authorize(c, p, origin, operation) {
      requireValue(
        origin.ownerId === p.ownerId &&
          origin.installationId === input.installationId &&
          p.allowedOperations.includes(operation),
        "APP_OWNER_MISMATCH",
      );
      const database = {
        query: async (sql: string, values?: unknown[]) =>
          (await c.query(sql, values)).rows,
        atomic: async <T>(fn: (db: any) => Promise<T>): Promise<T> =>
          fn(database),
      };
      const ownerCustody='kind' in input.custody&&input.custody.kind==='OWNER_FACTORY';
      requireValue(ownerCustody===isOwnerFactoryOrigin(origin),'APP_RESULT_BINDING');
      const current = ownerCustody ? await retainedOwnerTasksOrigin(database,p.ownerId,origin.resultId,input.custody as OwnerFactoryTasksCustody) : await retainedAlphaTasksOrigin(
        database,
        p.ownerId,
        origin.resultId,
        input.custody as AlphaTasksCustody,
      );
      requireValue(
        canonical(current.origin) === canonical(origin),
        "APP_RESULT_BINDING",
      );
      const installation = (
        await c.query(
          "SELECT organization_id,environment FROM capability_control.installations WHERE id=$1 AND active",
          [input.installationId],
        )
      ).rows[0];
      requireValue(
        installation?.environment === "qualification",
        "APP_RUNTIME_UNQUALIFIED",
      );
      const admission = await assertCapabilityAdmission(
        c,
        {
          ownerId: p.ownerId,
          installationId: input.installationId,
          organizationId: installation.organization_id,
          environment: "qualification",
          agentId: input.agentId,
        },
        {
          capabilityId: "myapps",
          workId: origin.workId,
          workGeneration: current.currentWork.generation,
          budgetMicros: 0,
        },
      );
      return {
        workVersion: current.currentWork.version,
        workGeneration: current.currentWork.generation,
        policyRevision: admission.policyRevision,
      };
    },
    async source(pkg) {
      requireValue(
        profiles.has(digest(pkg.runtime)),
        "APP_RUNTIME_UNQUALIFIED",
      );
      return input.source(pkg);
    },
    async execute(pkg, source, operation, body, data, operationId) {
      const runtime = profiles.get(digest(pkg.runtime));
      requireValue(runtime, "APP_RUNTIME_UNQUALIFIED");
      return runtime.execute(source, operation, body, data, operationId);
    },
  };
  return new AlphaTasksApps(pool, host);
}
