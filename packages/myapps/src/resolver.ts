import { Crm } from './crm.ts';
import type { Lead } from './crm.ts';
import { STAGES, text } from './contracts.ts';
import type { Stage } from './contracts.ts';
import { ReferenceStore } from './store.ts';
import type { Principal } from './store.ts';

export function resolveApp(store: ReferenceStore, principal: Principal, operation: string) {
  const session = store.session(principal);
  const apps = session.list().filter(app => {
    if (!app.enabled || app.installedVersion === null || !principal.allowedOperations.includes(operation)) return false;
    const version = session.version(app.appId, app.installedVersion);
    return version.state === 'VERIFIED' && version.package.spec.domain === 'crm' && [...version.package.spec.queries, ...version.package.spec.actions].some(x => x.name === operation);
  });
  if (apps.length !== 1) return { status: apps.length ? 'AMBIGUOUS' : 'NO_MATCH' } as const;
  return { status: 'MATCH' as const, appId: apps[0].appId, version: apps[0].installedVersion!, digest: apps[0].installedDigest!, operation };
}
/** Deterministic fixture grammar; no model inference or heuristic writes. */
export function sofieRequest(store: ReferenceStore, principal: Principal, requestId: string, request: string, asOf: string) {
  text(request, 1000);
  return store.conversation(principal, requestId, request, () => {
    const move = /^Move (.{1,160}) to (New|Contacted|Qualified|Discovery|Proposal|Won|Lost)\.$/.exec(request);
    const followups = request === 'Which leads need follow-up?' || request === 'Which leads need follow-up this week?';
    if (request === 'Add a Lead Source report.') return { status: 'WORK_REQUIRED', message: 'A verified update needs new Work and your installation approval.' };
    if (/^Send .+ a follow-up\.$/.test(request)) return { status: 'APPROVAL_REQUIRED', message: 'Sending a follow-up needs the separate email approval flow. Nothing was sent.' };
    if (!move && !followups) return { status: 'NO_MATCH', message: 'I could not match that request to an available App operation.' };
    const target = resolveApp(store, principal, move ? 'updateStage' : 'getFollowupsDue');
    if (target.status !== 'MATCH') return { ...target, message: target.status === 'AMBIGUOUS' ? 'More than one CRM can handle this. Choose an App.' : 'No enabled CRM is available.' };
    const crm = new Crm(store, principal);
    if (followups) {
      const due = crm.query(target.appId, target.version, target.digest, 'getFollowupsDue', { through: asOf });
      return { status: 'ANSWER', target, leads: due.map(l => ({ id: l.id, name: l.name, company: l.company, followup: l.followup })), message: due.length ? `${due.length} lead${due.length === 1 ? '' : 's'} need follow-up: ${due.map(l => l.company).join(', ')}.` : 'No leads need follow-up.' };
    }
    const matches = crm.query(target.appId, target.version, target.digest, 'listLeads', {}).filter((l: Lead) => [l.name, l.company].some(v => v.toLowerCase() === move![1].toLowerCase()));
    if (matches.length !== 1) return { status: matches.length ? 'AMBIGUOUS' : 'NO_MATCH', message: matches.length ? 'More than one lead matches. Choose a lead.' : 'No matching lead was found.' };
    const lead = crm.action(target.appId, target.version, target.digest, 'updateStage', { leadId: matches[0].id, expectedRevision: matches[0].revision, stage: move![2] as Stage }, `conversation:${requestId}`);
    return { status: 'ANSWER', target, lead: { id: lead.id, stage: lead.stage, revision: lead.revision }, message: `${lead.company} is now in ${lead.stage}.` };
  });
}
