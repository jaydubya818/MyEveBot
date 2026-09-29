import { BusinessScopes } from "../business-scopes.ts";
import { WorkStore } from "./store.ts";
import { digest } from "./contract.ts";
import { WorkRecallStore } from "../total-recall/work-retrieval.ts";
import { LearningStore } from "../total-recall/store.ts";
import { assembleSofieRecall } from "../total-recall/sofie-adapter.ts";

/** Data-only Recall boundary for the canonical model wrapper. Tool schemas,
 * admission, current authority, provider qualification and budget gates stay unchanged. */
export async function selectedWorkRecall(
  store: WorkStore,
  workId: string,
  reference: string,
) {
  if(process.env.MYEVE_PARTNER_OWNER_ID) {
    const scopes=new BusinessScopes(store.principal.actorId,store.database);
    if(await scopes.hasSharedWork(store.principal.scopeId,workId))
      return scopes.context({scope:"WORK_SCOPED",workOwner:store.principal.scopeId,workId});
  }
  if (process.env.MYEVE_WORK_RECALL_ENABLED !== "true") return null;
  const work = await store.get(workId);
  const context = await assembleSofieRecall(
    new WorkRecallStore(store),
    {
      contractVersion: 1,
      ownerId: store.principal.scopeId,
      workId,
      workVersion: work.version,
      repository: work.repository,
      objective: work.objective,
      projectId: null,
      scope: { selectedKnowledge: [], selectedOwnerMemoryIds: [] },
      context: {
        query: work.objective.slice(0, 500),
        purpose: "plan",
        workType: "implementation",
        reference: `sofie:${digest(reference)}`,
      },
      limits: { maxItems: 8, maxCharacters: 6000, minRelevance: 0.1 },
    },
    new LearningStore(store),
  );
  if (context.authorityGrants.length)
    throw new Error("Recall cannot grant authority");
  await store.database.query(
    `INSERT INTO beta_work_contexts(owner_id,work_id,context_ref,document) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,
    [
      store.principal.scopeId,
      workId,
      context.contextRef,
      JSON.stringify(context),
    ],
  );
  const [retained] = await store.database.query(
    "SELECT document FROM beta_work_contexts WHERE owner_id=$1 AND work_id=$2 AND context_ref=$3",
    [store.principal.scopeId, workId, context.contextRef],
  );
  if (
    retained?.document.workVersion !== context.workVersion ||
    retained?.document.attribution.contentHash !==
      context.attribution.contentHash
  )
    throw new Error(
      "Recalled context changed for this model step. Start a fresh step; no provider call is permitted.",
    );
  return context;
}
