import { ReferenceStore } from "./store.ts";
import type { Principal } from "./store.ts";
import { Crm } from "./crm.ts";
import { digest } from "./contracts.ts";
/** One request's disposable demonstration state. Never reads or writes installed owner data. */
export function previewSnapshot(
  store: ReferenceStore,
  principal: Principal,
  appId: string,
  previewId: string,
  creationIntent: string,
  asOf: string,
) {
  const session = store.session(principal),
    preview = session.preview(appId, previewId);
  const source = session.version(appId, preview.version);
  const sandbox = new ReferenceStore(":memory:", () => asOf + "T12:00:00.000Z");
  try {
    const pkg = { ...source.package, version: 1, base: null };
    const hash = digest(pkg);
    sandbox.register(creationIntent, pkg);
    sandbox.recordVerification(principal.ownerId, appId, 1, {
      format: "myapps.verification.reference.v1",
      appDigest: hash,
      candidateId: pkg.source.candidateId,
      verifier: "preview-fixture-bootstrap",
      status: "PASS",
      cleanupConfirmed: true,
      claims: [],
    });
    const host = {
      ...principal,
      kind: "human" as const,
      allowedOperations: [
        "apps.read",
        "apps.manage",
        "apps.install",
        ...pkg.spec.queries.map((x) => x.name),
        ...pkg.spec.actions.map((x) => x.name),
      ],
    };
    const temporary = sandbox.session(host),
      p = sandbox.createPreview(principal.ownerId, appId, 1),
      approval = temporary.requestInstall(appId, p.id);
    temporary.approveInstall(appId, approval.id);
    const crm = new Crm(sandbox, host);
    for (const [index, company] of [
      "Acme",
      "Northstar",
      "Cedar Studio",
    ].entries()) {
      let lead = crm.action(
        appId,
        1,
        hash,
        "createLead",
        {
          name: ["Alex Morgan", "Jordan Lee", "Sam Rivera"][index],
          company,
          contact: "contact@example.invalid",
          source: ["Conference", "Referral", "Website"][index],
          valueCents: [500000, 1200000, 350000][index],
        },
        `lead-${index}`,
      );
      lead = crm.action(
        appId,
        1,
        hash,
        "updateStage",
        {
          leadId: lead.id,
          expectedRevision: lead.revision,
          stage: ["Qualified", "Proposal", "New"][index] as
            "Qualified" | "Proposal" | "New",
        },
        `stage-${index}`,
      );
      crm.action(
        appId,
        1,
        hash,
        "scheduleFollowup",
        { leadId: lead.id, expectedRevision: lead.revision, date: asOf },
        `followup-${index}`,
      );
    }
    return {
      preview,
      spec: pkg.spec,
      proof: source.proof,
      installation: session.get(appId).installedVersion,
      leads: crm.query(appId, 1, hash, "listLeads", {}),
      pipeline: crm.query(appId, 1, hash, "getPipeline", {}),
      metrics: crm.query(appId, 1, hash, "getMetrics", {
        asOf,
        periodStart: asOf.slice(0, 8) + "01",
      }),
      mode: "SYNTHETIC_READ_ONLY_PREVIEW",
    };
  } finally {
    sandbox.close();
  }
}
