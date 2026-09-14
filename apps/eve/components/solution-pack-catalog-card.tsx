"use client";

import { Button } from "@cloudflare/kumo";
import { PlayIcon, PlusIcon } from "@phosphor-icons/react";

import type { RoleCatalog, RoleDefinition } from "@/lib/role-catalog";
import type { SolutionPack } from "@/lib/solution-pack";

function names(ids: readonly string[], items: readonly { id: string; name: string }[]): string[] {
  const byId = new Map(items.map((item) => [item.id, item.name]));
  return ids.map((id) => byId.get(id) ?? id);
}

export function SolutionPackCatalogCard({
  pack,
  roleCatalog,
  onCreateAgent,
  onUseRole,
}: {
  pack: SolutionPack;
  roleCatalog: RoleCatalog;
  onCreateAgent: (role: RoleDefinition) => void;
  onUseRole: (role: RoleDefinition) => void;
}) {
  const coordinator = roleCatalog.roles.find((role) => role.id === "founder-chief-of-staff");
  const workingGoals = pack.goalTemplates.filter((goal) => goal.maturity === "working");
  const preparationRules = pack.approvalPolicies.flatMap((policy) => policy.rules).filter((rule) => rule.requirement === "allowed");
  const approvalRules = pack.approvalPolicies.flatMap((policy) => policy.rules).filter((rule) => rule.requirement === "approval_required");

  return (
    <details className="group/pack rounded-xl border border-kumo-brand/25 bg-kumo-brand/5" open>
      <summary className="flex cursor-pointer list-none items-start gap-3 rounded-xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{pack.name}</span>
            <span className="rounded-full border border-kumo-brand/25 bg-kumo-base px-2 py-0.5 text-[10px] text-kumo-brand">Solution Pack</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">{pack.domains.length} domains</span>
          </span>
          <span className="mt-1 block max-w-3xl text-xs leading-5 text-kumo-subtle">{pack.description}</span>
        </span>
        <span className="mt-0.5 text-kumo-subtle transition-transform group-open/pack:rotate-90" aria-hidden>›</span>
      </summary>

      <div className="border-t border-kumo-brand/15 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-kumo-subtle">Purpose</p>
            <p className="mt-1 text-sm leading-6">{pack.purpose}</p>
            <p className="mt-2 text-xs text-kumo-subtle">Composes {names(pack.rolePackIds, roleCatalog.packs).join(" · ")}</p>
          </div>
          {coordinator && <div className="flex flex-wrap gap-2"><Button size="sm" variant="primary" icon={PlayIcon} onClick={() => onUseRole(coordinator)}>Use Founder OS</Button><Button size="sm" variant="secondary" icon={PlusIcon} onClick={() => onCreateAgent(coordinator)}>Create Founder Agent</Button></div>}
        </div>

        <section className="mt-5" aria-labelledby={`${pack.id}-domains`}>
          <div className="flex items-center justify-between gap-3"><h3 id={`${pack.id}-domains`} className="text-sm font-semibold">Operating domains</h3><span className="text-[11px] text-kumo-subtle">Health waits for canonical evidence</span></div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pack.domains.map((domain) => (
              <details key={domain.id} className="rounded-xl border border-kumo-hairline bg-kumo-base p-3">
                <summary className="cursor-pointer list-none outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand/50 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{domain.name}</span><span className="rounded-full bg-kumo-tint px-2 py-0.5 text-[10px] capitalize text-kumo-subtle">{domain.health.replaceAll("_", " ")}</span></span>
                  <span className="mt-1 block text-xs leading-5 text-kumo-subtle">{domain.purpose}</span>
                </summary>
                <div className="mt-3 border-t border-kumo-hairline pt-3 text-xs leading-5">
                  <p className="font-medium">Roles</p><p className="text-kumo-subtle">{names(domain.roleIds, roleCatalog.roles).join(" · ")}</p>
                  <p className="mt-2 font-medium">Example Goals</p><p className="text-kumo-subtle">{names(domain.goalTemplateIds, pack.goalTemplates).join(" · ") || "Defined by the owner"}</p>
                  <p className="mt-2 font-medium">Artifacts</p><p className="text-kumo-subtle">{names(domain.artifactIds, pack.artifactDefinitions).join(" · ") || "None in the first slice"}</p>
                  {domain.workflowIds.length > 0 && <><p className="mt-2 font-medium">Workflows</p><p className="text-kumo-subtle">{names(domain.workflowIds, pack.workflowTemplates).join(" · ")}</p></>}
                </div>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <details className="rounded-xl border border-kumo-hairline bg-kumo-base p-3"><summary className="cursor-pointer text-sm font-medium">Goal templates <span className="font-normal text-kumo-subtle">· {workingGoals.length} ready</span></summary><ul className="mt-2 space-y-2 text-xs text-kumo-subtle">{pack.goalTemplates.map((goal) => <li key={goal.id}><span className="font-medium text-kumo-default">{goal.name}</span> · {goal.maturity === "working" ? "Ready" : "Defined"}<span className="block">{goal.description}</span></li>)}</ul></details>
          <details className="rounded-xl border border-kumo-hairline bg-kumo-base p-3"><summary className="cursor-pointer text-sm font-medium">Workflows and artifacts <span className="font-normal text-kumo-subtle">· {pack.workflowTemplates.length} / {pack.artifactDefinitions.length}</span></summary><div className="mt-2 text-xs text-kumo-subtle">{pack.workflowTemplates.map((workflow) => <p key={workflow.id}><span className="font-medium text-kumo-default">{workflow.name}:</span> {workflow.description}</p>)}<p className="mt-2">Representative templates: {pack.artifactDefinitions.filter((item) => item.templateRef).map((item) => item.name).join(" · ")}</p></div></details>
          <details className="rounded-xl border border-kumo-hairline bg-kumo-base p-3"><summary className="cursor-pointer text-sm font-medium">Knowledge and capabilities</summary><div className="mt-2 text-xs text-kumo-subtle"><p><span className="font-medium text-kumo-default">Knowledge:</span> {pack.knowledgeRequirements.join(" · ")}</p><p className="mt-2"><span className="font-medium text-kumo-default">Recommended:</span> {pack.recommendedCapabilities.join(" · ")}</p><p className="mt-2">Context remains scoped and authorized; this pack does not create a separate Knowledge system.</p></div></details>
          <details className="rounded-xl border border-kumo-hairline bg-kumo-base p-3"><summary className="cursor-pointer text-sm font-medium">Approval boundaries</summary><div className="mt-2 text-xs text-kumo-subtle"><p><span className="font-medium text-kumo-default">Safe preparation:</span> {preparationRules.map((rule) => rule.action.replaceAll("_", " ")).join(" · ")}</p><p className="mt-2"><span className="font-medium text-kumo-default">Owner approval required:</span> {approvalRules.map((rule) => rule.action.replaceAll("_", " ")).join(" · ")}</p></div></details>
        </div>
      </div>
    </details>
  );
}
