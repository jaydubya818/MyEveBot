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
  await store.database.query(`DELETE FROM computer_resource_lifecycles WHERE environment=$1 AND state='cleaned' AND verified_at<now()-interval '30 days' AND provision_until<now()-interval '30 days'`,[computerResourceEnvironment()]);
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
