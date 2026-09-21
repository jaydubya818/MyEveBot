import { ActionGateway } from "./action-gateway.ts";
import { ComputerResourceStore, computerResourceEnvironment, resourceBinding } from "./computer-resource-store.ts";
import { computerLifecycle, computerTemplateKey } from "./computer-runtime.ts";
import { SqlComputerTemplateStore } from "./computer-template-store.ts";

/** Recovery can select only existing durable identities in this deployment environment. */
export async function recoverComputerResources(ownerId?: string) {
  const store = new ComputerResourceStore();
  const rows = await store.recoverable(computerResourceEnvironment());
  const retiredOwners=new Set<string>();
  for (const row of rows) {
    if (ownerId && row.owner_id !== ownerId) continue;
    const result=await new ActionGateway().terminateOwnedComputer({ binding: resourceBinding(row), initiator: "system" }).catch(() => null);
    if(result?.verified) retiredOwners.add(row.owner_id);
  }
  for(const owner of retiredOwners) await retireUnusedComputerTemplate(owner);
  // A committed session tombstone is the durable retirement trigger, even if
  // the process exited before calling retirement or a waiter delayed it.
  // This is independent of the 24-hour late-create inspection window.
  const pending = await store.database.query(`SELECT DISTINCT l.owner_id FROM computer_resource_lifecycles l
    JOIN computer_template_preparations p ON p.id=l.preparation_id
    WHERE l.environment=$1 AND l.state='cleaned' AND p.state IN ('READY','CLEANING')
      AND ($2::text IS NULL OR l.owner_id=$2)
      AND NOT EXISTS(SELECT 1 FROM computer_resource_lifecycles dependency WHERE dependency.preparation_id=p.id AND dependency.state<>'cleaned')
    ORDER BY l.owner_id LIMIT 10`, [computerResourceEnvironment(),ownerId ?? null]);
  for (const row of pending) {
    const owner = String(row.owner_id);
    await retireUnusedComputerTemplate(owner);
    await computerLifecycle().recover(computerTemplateKey(owner).scope);
  }
  await store.database.query(`DELETE FROM computer_resource_lifecycles l WHERE environment=$1 AND state='cleaned' AND verified_at<now()-interval '30 days' AND provision_until<now()-interval '30 days'
    AND NOT EXISTS(SELECT 1 FROM computer_template_preparations p WHERE p.id=l.preparation_id AND p.state<>'CLEANED')`,[computerResourceEnvironment()]);
}
export async function retireUnusedComputerTemplate(ownerId: string) {
  const store = new ComputerResourceStore();
  const key = computerTemplateKey(ownerId);
  const templates = new SqlComputerTemplateStore();
  const row = await templates.current(key);
  if (!row || row.state !== "READY" || await templates.hasWaiters(key)) return;
  const active = await store.database.query(`SELECT id FROM computer_resource_lifecycles WHERE preparation_id=$1 AND state<>'cleaned' LIMIT 1`,[row.id]);
  if (active.length) return;
  await computerLifecycle().cleanup(row, "invalid_template");
}
