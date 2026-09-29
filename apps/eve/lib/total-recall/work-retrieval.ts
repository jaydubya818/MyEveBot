import { WorkStore } from "../engineering/store.ts";
import { assertNoSecrets, digest } from "./learning.ts";
import { denyCrossWorkSelection, recallItemSchema, workRecallRequestSchema, type RecallBundle, type RecallItem, type RecallSelectionPolicy } from "./retrieval-contract.ts";

const stopWords = new Set(["the", "a", "an", "is", "are", "for", "to", "and", "of", "in", "with", "what", "this", "please"]);
function words(text: string) { return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(w => w.length > 1 && !stopWords.has(w)))]; }
export function recallRelevance(query: string, text: string): number {
  const terms = words(query); const tokens = new Set(words(text));
  return terms.length ? terms.filter(t => tokens.has(t)).length / terms.length : 0;
}
export function assertEvidenceData(text: string): void {
  assertNoSecrets(text);
  const normalized = text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (/ignore (?:all |previous |prior )*(?:instructions|rules)|(?:system|developer)\s*(?:prompt|message)\s*:|<\/?(?:system|instructions)>|bypass (?:approvals?|policy|safeguards)|(?:reveal|send|steal|print|disclose)\b.{0,50}\b(?:credentials?|tokens?|passwords?|secrets?)|(?:grant|expand)\b.{0,40}\b(?:authority|permissions?|access)|(?:javascript|data):/is.test(normalized))
    throw new Error("Instruction-like evidence is not eligible for recall.");
}

/** Read-only adapter over canonical Work, Knowledge and Memory. No migrations,
 * model calls, authority consumers, or protected execution imports. */
export class WorkRecallStore {
  constructor(readonly work: WorkStore, readonly selections: RecallSelectionPolicy = denyCrossWorkSelection) {
    if (work.principal.scopeKind !== "personal" || work.principal.scopeId !== work.principal.actorId) throw new Error("Recall requires the authenticated personal Work owner.");
  }
  async retrieve(value: unknown): Promise<RecallBundle> {
    const request = workRecallRequestSchema.parse(value);
    const owner = this.work.principal.scopeId;
    if (request.ownerId !== owner) throw new Error("Recall owner mismatch.");
    const current = await this.work.get(request.workId);
    if (request.repository !== current.repository || request.workVersion !== current.version || request.objective !== current.objective)
      throw new Error("Recall must match the canonical Work revision, objective and repository.");
    if (!await this.selections.authorize({ ownerId: owner, targetWorkId: current.id, repository: current.repository, ...request.scope }))
      throw new Error("Cross-Work or personal selection was not authorized.");
    for (const selected of request.scope.selectedKnowledge) {
      const sourceWork = await this.work.get(selected.workId);
      if (sourceWork.repository !== current.repository) throw new Error("Cross-repository recall is not eligible.");
      const [record] = await this.work.database.query(`SELECT 1 FROM engineering_work_knowledge WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2 AND knowledge_id=$3`, [owner, selected.workId, selected.knowledgeId]);
      if (!record) throw new Error("Selected Knowledge does not belong to the source Work.");
    }
    if (request.scope.selectedOwnerMemoryIds.length) {
      const rows = await this.work.database.query(`SELECT id FROM memory_records WHERE owner_id=$1 AND scope_type='owner' AND scope_id=$1 AND id=ANY($2::text[])`, [owner, request.scope.selectedOwnerMemoryIds]);
      if (rows.length !== new Set(request.scope.selectedOwnerMemoryIds).size) throw new Error("Selected Memory does not belong to the owner.");
    }
    // Roots are explicitly selected, but corrections may advance them. Follow
    // only the same owner's same-Work lineage; never broaden the selection.
    const rows = await this.work.database.query(`WITH RECURSIVE selected AS (
      SELECT k.id,link.work_id,ARRAY[k.id] AS path FROM engineering_work_knowledge link
      JOIN knowledge_records k ON k.owner_id=link.scope_id AND k.id=link.knowledge_id
      JOIN engineering_work w ON w.scope_id=link.scope_id AND w.scope_kind=link.scope_kind AND w.id=link.work_id
      WHERE link.scope_id=$1 AND link.scope_kind='personal' AND w.repository=$3
        AND (link.work_id=$2 OR EXISTS(SELECT 1 FROM jsonb_to_recordset($4::jsonb) AS x("workId" uuid,"knowledgeId" text) WHERE x."workId"=link.work_id AND x."knowledgeId"=k.id))
      UNION ALL
      SELECT next.id,link.work_id,s.path||next.id FROM selected s
      JOIN knowledge_records next ON next.owner_id=$1 AND next.supersedes_id=s.id
      JOIN engineering_work_knowledge link ON link.scope_id=$1 AND link.scope_kind='personal' AND link.work_id=s.work_id AND link.knowledge_id=next.id
      WHERE NOT next.id=ANY(s.path) AND cardinality(s.path)<50
    ) SELECT DISTINCT k.*,link.work_id,w.repository,
      EXISTS(SELECT 1 FROM knowledge_provenance_links conflict WHERE conflict.owner_id=$1 AND conflict.knowledge_id=k.id AND conflict.relation='contradicts') AS conflicting,
      (SELECT jsonb_agg(jsonb_build_object('sourceId',s.id,'type',s.source_type,'reference',coalesce(s.reference_uri,s.external_id,s.snapshot_ref,s.id),
        'contentHash',s.content_hash,'origin',CASE k.created_by_type WHEN 'owner' THEN 'OWNER' WHEN 'agent' THEN 'INFERENCE' ELSE 'OBSERVATION' END,'relation',p.relation))
       FROM knowledge_provenance_links p JOIN knowledge_sources s ON s.owner_id=p.owner_id AND s.id=p.source_id
       WHERE p.owner_id=$1 AND p.knowledge_id=k.id) AS provenance,
      (SELECT successor.id FROM knowledge_records successor WHERE successor.owner_id=$1 AND successor.supersedes_id=k.id ORDER BY successor.id LIMIT 1) AS successor
    FROM selected choice JOIN knowledge_records k ON k.owner_id=$1 AND k.id=choice.id
    JOIN engineering_work_knowledge link ON link.scope_id=$1 AND link.scope_kind='personal' AND link.knowledge_id=k.id AND link.work_id=choice.work_id
    JOIN engineering_work w ON w.scope_id=link.scope_id AND w.scope_kind=link.scope_kind AND w.id=link.work_id
    ORDER BY k.updated_at DESC,k.id LIMIT 201`, [owner,current.id,current.repository,JSON.stringify(request.scope.selectedKnowledge)]);
    if (rows.length > 200) throw new Error("Recall candidate limit reached; narrow the selection.");
    const candidates: RecallItem[] = rows.map(r => ({ identity: r.id, kind: "knowledge", text: r.statement, ownerId: owner,
      scope: { kind: "WORK", workId: r.work_id, repository: r.repository }, privacy: "WORK_SCOPED",
      truth: r.status === "superseded" || r.successor ? "HISTORICAL" : r.status === "stale" ? "STALE" : r.status === "contradicted" || r.conflicting ? "CONFLICTING" : Number(r.confidence) < .7 ? "UNCERTAIN" : "CURRENT",
      confidence: Number(r.confidence), relevance: recallRelevance(request.context.query,r.statement), supersedesId: r.supersedes_id, supersededById: r.successor,
      provenance: r.provenance ?? [], reasonUsed: r.work_id === current.id ? "Relevant evidence from current Work" : "Relevant owner-selected evidence from comparable Work; current correction followed" }));
    if (request.scope.selectedOwnerMemoryIds.length) {
      const memory = await this.work.database.query(`WITH RECURSIVE lineage AS (
        SELECT m.*,ARRAY[m.id] AS path FROM memory_records m WHERE owner_id=$1 AND scope_type='owner' AND scope_id=$1 AND id=ANY($2::text[])
        UNION ALL SELECT m.*,l.path||m.id FROM lineage l JOIN memory_records m ON m.owner_id=$1 AND m.scope_type='owner' AND m.scope_id=$1 AND m.source_type='owner_correction' AND m.source_id=l.id
        WHERE NOT m.id=ANY(l.path) AND cardinality(l.path)<50
      ) SELECT DISTINCT id,content,status,confidence,source_type,source_id FROM lineage LIMIT 201`,[owner,request.scope.selectedOwnerMemoryIds]);
      if (memory.length > 200) throw new Error("Memory lineage limit reached; narrow the selection.");
      for (const r of memory) candidates.push({ identity:r.id,kind:"memory",text:r.content,ownerId:owner,scope:{kind:"OWNER",workId:null,repository:null},privacy:"PRIVATE",
        truth:r.status==='active' ? (Number(r.confidence)<.7 ? "UNCERTAIN" : "CURRENT") : "HISTORICAL",confidence:Number(r.confidence),relevance:recallRelevance(request.context.query,r.content),
        supersedesId:r.source_type==='owner_correction'?r.source_id:null,supersededById:memory.find(n=>n.source_type==='owner_correction'&&n.source_id===r.id)?.id??null,
        provenance:[{sourceId:r.source_id??r.id,type:r.source_type,reference:r.source_id??r.id,contentHash:null,origin:r.source_type==='owner_correction'?"OWNER":"OBSERVATION",relation:r.source_type==='owner_correction'?"corrects":"observed_in"}],reasonUsed:"Explicitly selected private owner memory; remains private" });
    }
    const exclusions: RecallBundle["exclusions"] = {irrelevant:0,stale:0,historical:0,duplicate:0,unsafe:0,budget:0};
    const items: RecallItem[] = []; const seen = new Set<string>(); let characters=0;
    for (const item of candidates.sort((a,b)=>b.relevance-a.relevance || b.confidence-a.confidence || a.identity.localeCompare(b.identity))) {
      if(item.truth==='HISTORICAL'){exclusions.historical++;continue;}
      if(item.truth==='STALE'){exclusions.stale++;continue;}
      if(item.relevance<request.limits.minRelevance){exclusions.irrelevant++;continue;}
      try { recallItemSchema.parse(item); assertEvidenceData(JSON.stringify(item)); } catch { exclusions.unsafe++;continue; }
      const key=digest({text:item.text,scope:item.scope,truth:item.truth,provenance:item.provenance});
      if(seen.has(key)){exclusions.duplicate++;continue;} seen.add(key);
      const size=JSON.stringify(item).length;
      if(items.length>=request.limits.maxItems || characters+size>request.limits.maxCharacters){exclusions.budget++;continue;}
      items.push(item);characters+=size;
    }
    const after = await this.work.get(current.id);
    if(after.version!==current.version)throw new Error("Work changed during recall; reassemble context.");
    return {contractVersion:1,ownerId:owner,workId:current.id,workVersion:current.version,repository:current.repository,contextRef:request.context.reference,
      items,sourceRefs:[...new Set(items.flatMap(i=>[i.identity,...i.provenance.map(p=>p.sourceId)]))],contentHash:digest(items),characters,exclusions,trust:"EVIDENCE_ONLY",authorityGrants:[]};
  }
}
