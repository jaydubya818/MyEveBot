import { randomUUID } from "node:crypto";
import {
  ACTIONS,
  AppError,
  QUERIES,
  STAGES,
  keys,
  requireValue,
  text,
} from "./contracts.ts";
import type { Stage } from "./contracts.ts";
import type { ReferenceStore } from "./store.ts";
import type { Principal, AppRow } from "./store.ts";
export interface Lead {
  id: string;
  priority?: string | null;
  name: string;
  company: string;
  contact: string;
  source: string;
  stage: Stage;
  valueCents: number;
  spendCents: number;
  notes: { id: string; text: string; createdAt: string }[];
  followup: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  revision: number;
}
export interface LeadPatch {
  priority?: string | null;
  name?: string;
  company?: string;
  contact?: string;
  source?: string;
  valueCents?: number;
}
export interface ActionInput {
  createLead: {
    name: string;
    company: string;
    contact: string;
    source: string;
    valueCents: number;
  };
  updateLead: { leadId: string; expectedRevision: number; patch: LeadPatch };
  updateStage: { leadId: string; expectedRevision: number; stage: Stage };
  addNote: { leadId: string; expectedRevision: number; note: string };
  recordSpend: {
    leadId: string;
    expectedRevision: number;
    amountCents: number;
  };
  scheduleFollowup: {
    leadId: string;
    expectedRevision: number;
    date: string | null;
  };
}
export interface QueryInput {
  listLeads: { search?: string; stage?: Stage };
  getLead: { leadId: string };
  getPipeline: Record<string, never>;
  getFollowupsDue: { through: string };
  getMetrics: { asOf: string; periodStart: string };
}
export interface Metrics {
  openLeads: number;
  openPipelineCents: number;
  followupsDue: number;
  winRateBasisPoints: number;
  closedThisPeriod: number;
  acquisitionSpendCents: number;
}
export interface QueryOutput {
  listLeads: Lead[];
  getLead: Lead;
  getPipeline: { stage: Stage; leads: Lead[] }[];
  getFollowupsDue: Lead[];
  getMetrics: Metrics;
}
export function date(value: unknown): string {
  requireValue(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  );
  return value;
}
function cents(value: unknown): number {
  requireValue(
    Number.isSafeInteger(value) &&
      Number(value) >= 0 &&
      Number(value) <= 1_000_000_000,
  );
  return Number(value);
}
function stage(value: unknown): Stage {
  requireValue(STAGES.includes(value as Stage));
  return value as Stage;
}
function lead(app: AppRow, id: unknown): Lead {
  requireValue(typeof id === "string" && /^[a-f0-9-]{36}$/.test(id));
  if (!Object.hasOwn(app.data.leads, id)) throw new AppError();
  return app.data.leads[id];
}
const closed = (l: Lead) => l.stage === "Won" || l.stage === "Lost";
export class Crm {
  #store: Pick<ReferenceStore, "operate">;
  #principal: Principal;
  constructor(store: Pick<ReferenceStore, "operate">, principal: Principal) {
    this.#store = store;
    this.#principal = structuredClone(principal);
  }
  action<K extends keyof ActionInput>(
    id: string,
    version: number,
    hash: string,
    operation: K,
    input: ActionInput[K],
    requestKey: string,
  ): Lead;
  action(
    id: string,
    version: number,
    hash: string,
    operation: keyof ActionInput,
    input: unknown,
    requestKey: string,
  ): Lead {
    requireValue(
      ACTIONS.some((x) => x.name === operation),
      "APP_UNAVAILABLE",
    );
    return this.#store.operate(
      this.#principal,
      id,
      version,
      hash,
      operation,
      true,
      input,
      requestKey,
      (app, now, spec) => {
        if (operation === "createLead") {
          keys(input, ["name", "company", "contact", "source", "valueCents"]);
          requireValue(
            Object.keys(app.data.leads).length < 1000,
            "APP_CAPACITY",
          );
          const result: Lead = {
            id: randomUUID(),
            name: text(input.name),
            company: text(input.company),
            contact: text(input.contact),
            source: text(input.source),
            valueCents: cents(input.valueCents),
            spendCents: 0,
            stage: "New",
            notes: [],
            followup: null,
            createdAt: now,
            updatedAt: now,
            closedAt: null,
            revision: 1,
            ...(app.data.schemaVersion === 2 ? { priority: null } : {}),
          };
          app.data.leads[result.id] = result;
          return result;
        }
        const field = (
          {
            updateLead: "patch",
            updateStage: "stage",
            addNote: "note",
            recordSpend: "amountCents",
            scheduleFollowup: "date",
          } as Record<string, string>
        )[operation];
        keys(input, ["leadId", "expectedRevision", field]);
        const result = lead(app, input.leadId);
        requireValue(
          input.expectedRevision === result.revision,
          "LEAD_REVISION_CONFLICT",
        );
        switch (operation) {
          case "updateLead":
            keys(
              input.patch,
              [],
              [
                "name",
                "company",
                "contact",
                "source",
                "valueCents",
                ...(spec.schema.version === 2 ? ["priority"] : []),
              ],
            );
            requireValue(Object.keys(input.patch).length > 0);
            for (const [key, value] of Object.entries(input.patch)) {
              if (key === "priority")
                result.priority = value === null ? null : text(value);
              else if (key === "valueCents") result.valueCents = cents(value);
              else
                result[key as "name" | "company" | "contact" | "source"] =
                  text(value);
            }
            break;
          case "updateStage": {
            const next = stage(input.stage);
            result.closedAt = ["Won", "Lost"].includes(next)
              ? (result.closedAt ?? now)
              : null;
            result.stage = next;
            break;
          }
          case "addNote":
            requireValue(result.notes.length < 100, "APP_CAPACITY");
            result.notes.push({
              id: randomUUID(),
              text: text(input.note, 2000),
              createdAt: now,
            });
            break;
          case "recordSpend":
            result.spendCents = cents(
              result.spendCents + cents(input.amountCents),
            );
            break;
          case "scheduleFollowup":
            result.followup = input.date === null ? null : date(input.date);
            break;
        }
        result.revision++;
        result.updatedAt = now;
        return result;
      },
    );
  }
  query<K extends keyof QueryInput>(
    id: string,
    version: number,
    hash: string,
    operation: K,
    input: QueryInput[K],
  ): QueryOutput[K];
  query(
    id: string,
    version: number,
    hash: string,
    operation: keyof QueryInput,
    input: unknown,
  ): any {
    requireValue(
      QUERIES.some((x) => x.name === operation),
      "APP_UNAVAILABLE",
    );
    return this.#store.operate(
      this.#principal,
      id,
      version,
      hash,
      operation,
      false,
      input,
      null,
      (app) => {
        const leads = (Object.values(app.data.leads) as Lead[]).sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        );
        switch (operation) {
          case "listLeads":
            keys(input, [], ["search", "stage"]);
            if (input.stage !== undefined) stage(input.stage);
            if (input.search !== undefined) text(input.search);
            return leads.filter(
              (l) =>
                (!input.stage || l.stage === input.stage) &&
                (!input.search ||
                  `${l.name} ${l.company}`
                    .toLowerCase()
                    .includes(input.search.toLowerCase())),
            );
          case "getLead":
            keys(input, ["leadId"]);
            return lead(app, input.leadId);
          case "getPipeline":
            keys(input, []);
            return STAGES.map((stage) => ({
              stage,
              leads: leads.filter((l) => l.stage === stage),
            }));
          case "getFollowupsDue":
            keys(input, ["through"]);
            date(input.through);
            return leads.filter(
              (l) =>
                !closed(l) &&
                l.followup !== null &&
                l.followup <= input.through,
            );
          case "getMetrics": {
            keys(input, ["asOf", "periodStart"]);
            date(input.asOf);
            date(input.periodStart);
            requireValue(input.periodStart <= input.asOf);
            const sum = (rows: Lead[], key: "valueCents" | "spendCents") =>
              rows.reduce((total, l) => total + l[key], 0);
            const done = leads.filter(closed),
              open = leads.filter((l) => !closed(l));
            return {
              openLeads: open.length,
              openPipelineCents: sum(open, "valueCents"),
              followupsDue: open.filter(
                (l) => l.followup && l.followup <= input.asOf,
              ).length,
              winRateBasisPoints: done.length
                ? Math.round(
                    (done.filter((l) => l.stage === "Won").length * 10000) /
                      done.length,
                  )
                : 0,
              closedThisPeriod: done.filter(
                (l) =>
                  l.closedAt &&
                  l.closedAt.slice(0, 10) >= input.periodStart &&
                  l.closedAt.slice(0, 10) <= input.asOf,
              ).length,
              acquisitionSpendCents: sum(leads, "spendCents"),
            };
          }
          default:
            throw new AppError();
        }
      },
    );
  }
}
