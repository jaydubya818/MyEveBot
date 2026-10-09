"use client";

import { Button } from "@cloudflare/kumo";
import { useRef, useState } from "react";
import { z } from "zod";

const check = <T extends string>(name: T) => z.object({ name: z.literal(name), status: z.number().int(), result: z.enum(["PASS", "FAIL"]) }).strict();
const reportSchema = z.object({
  status: z.enum(["PASS", "FAIL"]),
  checks: z.tuple([
    check("production-workload-without-application-authentication"),
    check("production-workload-invalid-application-identity"),
    check("valid-application-identity-unauthorized-work"),
  ]),
  installation: z.object({
    environment: z.literal("CLOUD"), name: z.literal("MyFactory cloud"),
    platform: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    execution: z.literal("AWAITING_QUALIFICATION_AND_AUTHORIZATION"),
    admission: z.literal("DISABLED"), publication: z.literal("DISABLED"),
    dependencies: z.object({ database: z.enum(["AVAILABLE", "UNAVAILABLE"]), artifacts: z.enum(["AVAILABLE", "UNAVAILABLE"]), provider: z.enum(["AVAILABLE", "UNAVAILABLE"]) }).strict(),
  }).strict(),
  workAdmitted: z.literal(false), modelOperations: z.literal(0),
}).strict();
const labels = ["Missing application identity denied", "Invalid application identity denied", "Unauthorized Work denied"];

/** Owner-invoked observation only. The server owns all identities and destinations. */
export function FactoryInstallationPanel() {
  const busy = useRef(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<z.infer<typeof reportSchema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function runCheck() {
    if (busy.current) return;
    busy.current = true; setLoading(true); setReport(null); setError(null);
    try {
      const response = await fetch("/api/beta/factory-installation", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(35000) });
      if (response.status === 401) { setError("Sign in again to check this connection."); return; }
      if (response.status === 403) { setError("This connection is private to its owner."); return; }
      if (![200, 503].includes(response.status)) throw Error("Unavailable");
      const result = reportSchema.parse(await response.json());
      const passed = result.checks.every((item, index) => item.result === "PASS" && item.status === (index === 2 ? 403 : 401)) && result.installation.platform === "AVAILABLE" && Object.values(result.installation.dependencies).every(value => value === "AVAILABLE");
      if ((result.status === "PASS") !== passed || (response.status === 200) !== passed) throw Error("Inconsistent observation");
      setReport(result);
    } catch { setError("The connection check could not complete. Try again. Work remains disabled."); }
    finally { busy.current = false; setLoading(false); }
  }
  return <section aria-labelledby="factory-installation-heading" className="mb-5 rounded-2xl border border-kumo-hairline p-5">
    <h3 id="factory-installation-heading" className="text-sm font-semibold">MyFactory cloud connection</h3>
    <p className="mt-2 text-sm text-kumo-subtle">Check the private connection, service availability and access protections. This check does not start Work or call a model.</p>
    <Button className="mt-4" size="sm" variant="secondary" disabled={loading} onClick={() => void runCheck()}>{loading ? "Checking connection…" : "Check cloud connection"}</Button>
    <div className="mt-3 text-sm" role="status" aria-live="polite" aria-busy={loading}>
      {!report && !error && !loading && <p>Connection not checked in this session. Work remains disabled.</p>}
      {loading && <p>Checking connection and access protections…</p>}
      {error && <p>{error}</p>}
      {report && <><p className="font-medium">{report.status === "PASS" ? "Connection checks passed. Work remains disabled." : "Connection needs attention. Work remains disabled."}</p>
        <ul className="mt-2 space-y-1">{report.checks.map((item, index) => <li key={item.name}>{labels[index]}: {item.result === "PASS" ? "Passed" : "Needs attention"}</li>)}
          <li>Database: {report.installation.dependencies.database === "AVAILABLE" ? "Available" : "Unavailable"}</li>
          <li>Artifact storage: {report.installation.dependencies.artifacts === "AVAILABLE" ? "Available" : "Unavailable"}</li>
          <li>Sandbox service: {report.installation.dependencies.provider === "AVAILABLE" ? "Available" : "Unavailable"}</li></ul>
        <p className="mt-2 text-kumo-subtle">Execution still requires qualification and your authorization. Publication is disabled.</p></>}
    </div>
  </section>;
}
