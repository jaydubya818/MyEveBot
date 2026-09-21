import { AsyncLocalStorage } from "node:async_hooks";
import { Readable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import type { vercel } from "eve/sandbox/vercel";
import type { SandboxSession } from "eve/sandbox";
import { consumeComputerProvisionAuthority, type AuthorizedAction } from "./action-gateway.ts";
import type { Preparation } from "./computer-template-lifecycle.ts";
import { computerProviderCredentials } from "./computer-template-vercel.ts";
import { ComputerResourceStore, computerResourceEnvironment, resourceTags, type ComputerResource } from "./computer-resource-store.ts";
import { assertOwnedComputer, findOwnedComputer } from "./computer-resource-provider.ts";

const grants = new AsyncLocalStorage<{ preparation: Preparation; authority: AuthorizedAction; revalidate: () => Promise<void>; consumed: boolean; resource?: ComputerResource }>();
export class ComputerSandboxAuthorityRequired extends Error {
  constructor() { super("Computer session creation requires current Action Gateway authority."); this.name = "ComputerSandboxAuthorityRequired"; }
}
export async function withPreparedComputer<T>(preparation: Preparation, authority: AuthorizedAction, parameters: Record<string, unknown>, work: () => Promise<T>): Promise<T> {
  const revalidate=await consumeComputerProvisionAuthority(authority, parameters);
  return grants.run({ preparation, authority, revalidate, consumed: false }, work);
}
/** Only the canonical provision adapter has the consumed creation grant. */
export async function bindPreparedComputer(ownerId: string, sessionId: string, runId: string) {
  const grant = grants.getStore();
  if (!grant || grant.consumed || grant.resource || !grant.preparation.templateId) throw new ComputerSandboxAuthorityRequired();
  grant.resource = await new ComputerResourceStore().establish({ ownerId, sessionId, runId, environment: computerResourceEnvironment(),
    provisionId: grant.authority.authorityId, preparationId: grant.preparation.id, snapshotId: grant.preparation.templateId });
  return grant.resource;
}
async function bytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> { return new Uint8Array(await new Response(stream).arrayBuffer()); }
function sessionHandle(sandbox: Sandbox, row: ComputerResource): SandboxSession {
  const resolvePath = (path: string) => path.startsWith("/") ? path : `/workspace/${path}`;
  // Execution authorization remains in the ordinary action adapters. This check also
  // fences cached framework handles immediately when lifecycle termination begins.
  async function active() {
    const store = new ComputerResourceStore();
    if (!await store.executable(row)) throw new Error("Computer resource is no longer executable.");
  }
  const session: SandboxSession = {
    id: row.resource_name, resolvePath,
    async run(options) {
      const process = await session.spawn(options);
      const [stdout,stderr,result] = await Promise.all([bytes(process.stdout),bytes(process.stderr),process.wait()]);
      return { stdout: new TextDecoder().decode(stdout), stderr: new TextDecoder().decode(stderr), exitCode: result.exitCode };
    },
    async spawn(options) {
      await active();
      const command = await sandbox.runCommand({ cmd: "bash", args: ["-lc",options.command], cwd: options.workingDirectory ?? "/workspace",
        detached: true, env: options.env, signal: options.abortSignal });
      const encoder = new TextEncoder();
      let out!: ReadableStreamDefaultController<Uint8Array>, err!: ReadableStreamDefaultController<Uint8Array>;
      const stdout = new ReadableStream<Uint8Array>({ start(controller) { out=controller; } });
      const stderr = new ReadableStream<Uint8Array>({ start(controller) { err=controller; } });
      const logs = (async () => { try { for await (const chunk of command.logs()) (chunk.stream === "stdout" ? out : err).enqueue(encoder.encode(chunk.data)); out.close(); err.close(); }
        catch (error) { out.error(error); err.error(error); throw error; } })();
      void logs.catch(() => {});
      return { stdout, stderr, async wait() { const result=await command.wait(); await logs; return {exitCode:result.exitCode}; }, async kill() { await command.kill(); } };
    },
    async readFile(options) {
      await active(); const stream = await sandbox.readFile({path:resolvePath(options.path)});
      return stream ? Readable.toWeb(stream as Readable) as ReadableStream<Uint8Array> : null;
    },
    async readBinaryFile(options) { const stream=await session.readFile(options); return stream ? bytes(stream) : null; },
    async readTextFile(options) {
      for (const value of [options.startLine,options.endLine]) if (value !== undefined && (!Number.isInteger(value) || value < 1)) throw new Error("Line numbers must be positive integers.");
      if (options.startLine && options.endLine && options.startLine>options.endLine) throw new Error("Invalid line range.");
      const data=await session.readBinaryFile(options); if (!data) return null;
      const text=Buffer.from(data).toString((options.encoding ?? "utf8") as BufferEncoding);
      return options.startLine || options.endLine ? (text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? []).slice((options.startLine??1)-1,options.endLine).join("") : text;
    },
    async writeFile(options) { await active(); await sandbox.writeFiles([{path:resolvePath(options.path),content:Buffer.from(await bytes(options.content))}]); },
    async writeBinaryFile(options) { await active(); await sandbox.writeFiles([{path:resolvePath(options.path),content:Buffer.from(options.content)}]); },
    async writeTextFile(options) { await session.writeBinaryFile({...options,content:Buffer.from(options.content,(options.encoding ?? "utf8") as BufferEncoding)}); },
    async removePath(options) { await active(); await sandbox.fs.rm(resolvePath(options.path),{force:options.force,recursive:options.recursive,signal:options.abortSignal}); },
    async setNetworkPolicy(networkPolicy) { await active(); await sandbox.update({networkPolicy}); },
  };
  return session;
}
export const computerSandboxBackend: ReturnType<typeof vercel> = {
  name: "myeve-computer-v1",
  async prewarm() { return {reused:false}; },
  async create(input) {
    const grant = grants.getStore();
    if (!grant?.resource && typeof input.existingMetadata?.lifecycleId === "string") {
      const store = new ComputerResourceStore();
      const rows = await store.database.query(`SELECT * FROM computer_resource_lifecycles WHERE id=$1 AND runtime_session_id=$2 AND environment=$3 AND state='active'`,
        [input.existingMetadata.lifecycleId,input.sessionKey,computerResourceEnvironment()]);
      if (rows.length !== 1) throw new Error("Computer reconnect binding is unavailable.");
      const row=rows[0] as ComputerResource;
      if (grant) { await grant.revalidate(); if (grant.authority.target.account!==row.owner_id) throw new ComputerSandboxAuthorityRequired(); grant.consumed=true; }
      if (!await store.executable(row)) throw new Error("Computer reconnect is fenced.");
      const sandbox=await findOwnedComputer(row);
      if (!sandbox || sandbox.status !== "running") throw new Error("Computer resource is not running.");
      const session=sessionHandle(sandbox,row);
      return {session,useSessionFn:async options=>{if(options?.networkPolicy) await session.setNetworkPolicy(options.networkPolicy);return session;},captureState:async()=>({backendName:"myeve-computer-v1",sessionKey:input.sessionKey,metadata:{lifecycleId:row.id}}),shutdown:async()=>{}};
    }
    if (!grant || grant.consumed || !grant.resource || grant.preparation.state !== "READY"
      || grant.authority.signal?.aborted || Date.now()>=grant.authority.expiresAt) throw new ComputerSandboxAuthorityRequired();
    grant.consumed = true;
    let row = grant.resource;
    const store = new ComputerResourceStore();
    // Exclusive creation: never look up and retag a caller-named resource.
    const deadlines=await store.database.query(`SELECT extract(epoch FROM least(s.expires_at,coalesce(r.deadline_at,s.expires_at))-now())*1000 AS remaining
      FROM computer_sessions s JOIN task_runs r ON r.id=s.run_id AND r.owner_id=s.owner_id
      JOIN computer_resource_lifecycles l ON l.computer_session_id=s.id
      WHERE l.id=$1 AND l.state='provisioning' AND l.version=$2 AND l.provision_until>now() AND s.status='provisioning'`,[row.id,row.version]);
    const timeout=Math.floor(Number(deadlines[0]?.remaining));
    if(!Number.isFinite(timeout)||timeout<1000) throw new Error("Computer creation deadline expired.");
    await grant.revalidate();
    const sandbox = await Sandbox.create({ ...computerProviderCredentials(), name: row.resource_name, persistent: true,
      resources:{vcpus:2},timeout,source:{type:"snapshot",snapshotId:row.source_snapshot_id},networkPolicy:"deny-all",
      tags:resourceTags(row),signal:grant.authority.signal });
    assertOwnedComputer(sandbox,row);
    await grant.revalidate();
    row = await store.activate(row,sandbox.currentSession().sessionId);
    const session = sessionHandle(sandbox,row);
    return { session, useSessionFn:async options=>{if(options?.networkPolicy) await session.setNetworkPolicy(options.networkPolicy);return session;},
      async captureState() { return { backendName:"myeve-computer-v1",sessionKey:input.sessionKey,metadata:{lifecycleId:row.id} }; },
      async shutdown() { /* Durable timeout/recovery owns termination; shutdown grants no provider authority. */ },
    };
  },
};
