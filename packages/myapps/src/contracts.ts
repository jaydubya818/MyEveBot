import { createHash } from 'node:crypto';

export class AppError extends Error {
  code: string;
  constructor(code: string = 'APP_UNAVAILABLE') { super(code); this.code = code; }
}
export function requireValue(value: unknown, code = 'INVALID_APP_INPUT'): asserts value {
  if (!value) throw new AppError(code);
}
/** JSON only, with sorted object keys, significant array order and no lossy values. */
export function canonical(value: unknown): string {
  const ancestors = new Set<object>();
  function visit(v: unknown, depth: number): string {
    requireValue(depth < 32);
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') { requireValue(Number.isSafeInteger(v) && !Object.is(v, -0)); return String(v); }
    requireValue(typeof v === 'object' && v !== null && !ancestors.has(v));
    ancestors.add(v);
    let result: string;
    if (Array.isArray(v)) {
      requireValue(Object.keys(v).length === v.length);
      result = '[' + v.map(x => visit(x, depth + 1)).join(',') + ']';
    } else {
      requireValue(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
      const object = v as Record<string, unknown>;
      result = '{' + Object.keys(object).sort().map(k => {
        requireValue(!['__proto__', 'constructor', 'prototype'].includes(k));
        return JSON.stringify(k) + ':' + visit(object[k], depth + 1);
      }).join(',') + '}';
    }
    ancestors.delete(v);
    return result;
  }
  const result = visit(value, 0);
  requireValue(Buffer.byteLength(result) <= 100_000);
  return result;
}
export const digest = (value: unknown): string => 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex');
export const isDigest = (v: unknown): v is string => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v);
export function text(v: unknown, max = 160): string {
  requireValue(typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v));
  return v;
}
export function keys(v: unknown, required: string[], optional: string[] = []): asserts v is Record<string, any> {
  requireValue(v && typeof v === 'object' && !Array.isArray(v));
  requireValue(required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => [...required, ...optional].includes(k)));
}
export const STAGES = ['New', 'Contacted', 'Qualified', 'Discovery', 'Proposal', 'Won', 'Lost'] as const;
export type Stage = typeof STAGES[number];
// This binding is copied verbatim from MySkills BINDING_SCHEMA at the compatibility pin.
export interface SkillBinding { skill_id: string; version: string; digest: string }
export interface WorkBinding { ownerId: string; workId: string; workVersion: number; workGeneration: number }
export interface Operation {
  name: string; input: Record<string, string>; output: string;
  access: 'read' | 'write'; idempotency: 'read-only' | 'request-key';
}
export const QUERIES: Operation[] = [
  { name: 'listLeads', input: { search: 'optional:string', stage: 'optional:Stage' }, output: 'Lead[]', access: 'read', idempotency: 'read-only' },
  { name: 'getLead', input: { leadId: 'uuid' }, output: 'Lead', access: 'read', idempotency: 'read-only' },
  { name: 'getPipeline', input: {}, output: 'StageGroup[]', access: 'read', idempotency: 'read-only' },
  { name: 'getFollowupsDue', input: { through: 'date' }, output: 'Lead[]', access: 'read', idempotency: 'read-only' },
  { name: 'getMetrics', input: { asOf: 'date', periodStart: 'date' }, output: 'Metrics', access: 'read', idempotency: 'read-only' },
];
export const ACTIONS: Operation[] = [
  { name: 'createLead', input: { name: 'string', company: 'string', contact: 'string', source: 'string', valueCents: 'nonnegative-integer' }, output: 'Lead', access: 'write', idempotency: 'request-key' },
  { name: 'updateLead', input: { leadId: 'uuid', expectedRevision: 'integer', patch: 'LeadPatch' }, output: 'Lead', access: 'write', idempotency: 'request-key' },
  ...['updateStage', 'addNote', 'recordSpend', 'scheduleFollowup'].map(name => ({ name, input: { leadId: 'uuid', expectedRevision: 'integer', [({ updateStage: 'stage', addNote: 'note', recordSpend: 'amountCents', scheduleFollowup: 'date' } as Record<string,string>)[name]]: ({ updateStage: 'Stage', addNote: 'string', recordSpend: 'nonnegative-integer', scheduleFollowup: 'date|null' } as Record<string,string>)[name] }, output: 'Lead', access: 'write' as const, idempotency: 'request-key' as const })),
];
export interface AppSpec {
  format: 'myeve.app-spec.reference.v1'; name: string; purpose: string; ownerId: string; domain: 'crm';
  schema: { version: 1; resources: Record<string, Record<string, string>> };
  queries: Operation[]; actions: Operation[];
  ui: { host: 'lead-crm.v1'; views: string[]; navigation: string[] };
  skills: SkillBinding[]; capabilities: string[]; requestedEffects: string[];
  externalDependencies: string[]; network: { mode: 'deny'; hosts: string[] }; secrets: string[];
  verification: string[]; runtime: 'trusted-declarative-reference.v1'; installation: 'explicit-owner-decision';
}
export function leadCrmSpec(ownerId: string, sourceReport = false): AppSpec {
  return {
    format: 'myeve.app-spec.reference.v1', name: 'Lead CRM', purpose: 'Track leads, pipeline, acquisition spend, notes and follow-ups.', ownerId: text(ownerId), domain: 'crm',
    schema: { version: 1, resources: { leads: { id: 'uuid', name: 'string', company: 'string', contact: 'string', source: 'string', stage: 'Stage', valueCents: 'nonnegative-integer', spendCents: 'nonnegative-integer', notes: 'Note[]', followup: 'date|null', createdAt: 'timestamp', updatedAt: 'timestamp', closedAt: 'timestamp|null', revision: 'integer' } } },
    queries: structuredClone(QUERIES), actions: structuredClone(ACTIONS),
    ui: { host: 'lead-crm.v1', views: ['Overview', 'Pipeline', 'Leads', 'Lead Detail', 'Follow-ups', ...(sourceReport ? ['Lead Sources'] : [])], navigation: ['Overview', 'Pipeline', 'Leads', 'Follow-ups', ...(sourceReport ? ['Lead Sources'] : [])] },
    skills: [], capabilities: [], requestedEffects: [], externalDependencies: [], network: { mode: 'deny', hosts: [] }, secrets: [],
    verification: ['schema', 'actions', 'queries', 'owner-isolation', 'effect-denial', 'ui-agent-consistency', 'candidate-binding', 'cleanup'],
    runtime: 'trusted-declarative-reference.v1', installation: 'explicit-owner-decision',
  };
}
/** Only the two reviewed declarative templates are executable by this host. */
export function validateSpec(value: unknown): AppSpec {
  canonical(value);
  keys(value, Object.keys(leadCrmSpec('fixture')));
  text(value.ownerId);
  const valid = [false, true].some(report => canonical(value) === canonical(leadCrmSpec(value.ownerId, report)));
  requireValue(valid, 'APP_SPEC_UNSUPPORTED');
  return structuredClone(value) as AppSpec;
}
export interface AppPackage {
  format: 'myeve.app-package.reference.v1'; appId: string; version: number; spec: AppSpec;
  work: WorkBinding; source: { repositoryCommit: string; template: 'lead-crm.v1'; candidateId: string };
  factoryVersion: { sourceCommit: string; configurationDigest: string };
  base: { version: number; digest: string } | null;
  migration: { kind: 'identity'; fromSchema: 1; toSchema: 1 };
}
export function validatePackage(value: unknown): AppPackage {
  keys(value, ['format', 'appId', 'version', 'spec', 'work', 'source', 'factoryVersion', 'base', 'migration']);
  requireValue(value.format === 'myeve.app-package.reference.v1');
  requireValue(/^app_[a-f0-9]{32}$/.test(value.appId));
  requireValue(Number.isSafeInteger(value.version) && value.version > 0);
  const spec = validateSpec(value.spec);
  keys(value.work, ['ownerId', 'workId', 'workVersion', 'workGeneration']);
  requireValue(value.work.ownerId === spec.ownerId);
  text(value.work.workId);
  requireValue([value.work.workVersion, value.work.workGeneration].every(n => Number.isSafeInteger(n) && n > 0));
  keys(value.source, ['repositoryCommit', 'template', 'candidateId']);
  requireValue(/^[a-f0-9]{40}$/.test(value.source.repositoryCommit) && value.source.template === 'lead-crm.v1');
  text(value.source.candidateId);
  keys(value.factoryVersion, ['sourceCommit', 'configurationDigest']);
  requireValue(/^[a-f0-9]{40}$/.test(value.factoryVersion.sourceCommit) && isDigest(value.factoryVersion.configurationDigest));
  if (value.version === 1) requireValue(value.base === null);
  else {
    keys(value.base, ['version', 'digest']);
    requireValue(value.base.version === value.version - 1 && isDigest(value.base.digest));
  }
  requireValue(canonical(value.migration) === canonical({ kind: 'identity', fromSchema: 1, toSchema: 1 }));
  canonical(value);
  return structuredClone(value) as AppPackage;
}
export function appId(ownerId: string, creationIntent: string): string {
  return 'app_' + digest({ ownerId: text(ownerId), creationIntent: text(creationIntent) }).slice(7, 39);
}
