import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  digest,
  PROFILE,
  TUPLE,
  DATA_CONTRACT,
  alphaTasksAppId,
} from "../../src/alpha-tasks/contracts.ts";
import {
  verifySourceClosure,
  sourceClosureDigest,
} from "../../src/alpha-tasks/source.ts";
export const image =
  process.env.MYAPPS_ALPHA_TEST_IMAGE_ID ?? "sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0";
if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error("IMMUTABLE_LOCAL_FIXTURE_IMAGE_REQUIRED");
const source = `import {readFileSync,writeFileSync} from 'node:fs';
export function createStore(path){const read=()=>JSON.parse(readFileSync(path,'utf8'));const save=d=>writeFileSync(path,JSON.stringify(d));const valid=p=>{if(!['Low','Medium','High'].includes(p))throw Error('priority');};
return{list:()=>read().tasks,create:input=>{valid(input.priority);const d=read(),t={id:d.next++,title:input.title.trim(),done:false,priority:input.priority};d.tasks.push(t);save(d);return t;},update:(id,patch)=>{if('priority'in patch)valid(patch.priority);const d=read(),t=d.tasks.find(t=>t.id===id);if(!t)throw Error('missing');Object.assign(t,patch);save(d);return t;}};}`;
function hash(kind, b) {
  return execFileSync("git", ["hash-object", "--stdin", "-t", kind], {
    input: b,
    encoding: "utf8",
  }).trim();
}
export function fixture(extra = {}) {
  const files = {
    "package.json": '{"type":"module"}',
    "src/tasks.js": source,
    "src/render.js": `export const renderTaskList=tasks=>'<ul>'+tasks.map(t=>'<li>'+t.priority+'</li>').join('')+'</ul>';`,
    ...extra,
  };
  const paths = Object.keys(files).sort();
  function tree(prefix = "") {
    const names = [
      ...new Set(
        paths
          .filter((p) => p.startsWith(prefix))
          .map((p) => p.slice(prefix.length).split("/")[0]),
      ),
    ];
    const entries = names
      .map((name) => {
        const path = prefix + name,
          dir = paths.some((p) => p.startsWith(path + "/"));
        return {
          name,
          dir,
          id: dir ? tree(path + "/") : hash("blob", Buffer.from(files[path])),
        };
      })
      .sort((a, b) =>
        Buffer.compare(
          Buffer.from(a.name + (a.dir ? "/" : "")),
          Buffer.from(b.name + (b.dir ? "/" : "")),
        ),
      );
    return hash(
      "tree",
      Buffer.concat(
        entries.map((e) =>
          Buffer.concat([
            Buffer.from((e.dir ? "40000" : "100644") + " " + e.name + "\0"),
            Buffer.from(e.id, "hex"),
          ]),
        ),
      ),
    );
  }
  const closure = verifySourceClosure(
    {
      format: "myapps.source-closure.v1",
      tree: tree(),
      files: paths.map((path) => ({
        path,
        mode: "100644",
        base64: Buffer.from(files[path]).toString("base64"),
      })),
    },
    tree(),
  );
  const runtime = {
    profile: PROFILE,
    adapterDigest: digest({
      format: "myapps.alpha-tasks-adapter.v1",
      units: [
        "../contracts.ts",
        "contracts.ts",
        "isolation.ts",
        "runner.mjs",
        "source.ts",
      ].map((path) => ({
        path,
        sha256: createHash("sha256")
          .update(
            readFileSync(
              new URL("../../src/alpha-tasks/" + path, import.meta.url),
            ),
          )
          .digest("hex"),
      })),
    }),
    image,
    dataContract: DATA_CONTRACT,
    tasksModule: "src/tasks.js",
    renderModule: "src/render.js",
    network: "deny",
    secrets: [],
  };
  const h = "a".repeat(64),
    g = "b".repeat(40),
    origin = {
      ownerId: "synthetic-owner",
      installationId: "synthetic-installation",
      connectionId: "synthetic-connection",
      tenantId: "synthetic-tenant",
      projectId: "synthetic-project",
      missionId: "synthetic-mission",
      planId: "synthetic-plan",
      planDigest: "sha256:" + h,
      workOrderId: "synthetic-order",
      workOrderRevisionId: "synthetic-revision",
      workId: "11111111-1111-4111-8111-111111111111",
      workVersion: 1,
      workGeneration: 1,
      tupleSha256: TUPLE,
      permitDigest: h,
      resultId: "synthetic-result",
      resultDigest: h,
      proofHash: h,
      authorityId: "synthetic-authority",
      authoritySha256: h,
      factoryWorkOrderId: "synthetic-factory-order",
      attemptNumber: 1,
      requestId: "synthetic-request",
      requestDigest: h,
      runId: "synthetic-run",
      factoryVersion: h,
      sourceDigest: h,
      configurationDigest: h,
      inputCommit: g,
      inputTree: g,
      candidateCommit: g,
      candidateTree: closure.tree,
      patchDigest: h,
    };
  return {
    closure,
    runtime,
    pkg: {
      format: "myeve.app-package.alpha-tasks.v1",
      appId: alphaTasksAppId(
        origin.ownerId,
        origin.installationId,
        origin.missionId,
      ),
      version: 1,
      spec: { ownerId: origin.ownerId, profile: PROFILE },
      origin,
      sourceClosureDigest: sourceClosureDigest(closure),
      runtime,
      base: null,
      migration: "identity",
      installation: "explicit-owner-decision",
    },
  };
}
