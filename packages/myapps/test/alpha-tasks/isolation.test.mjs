import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  IsolatedExecutionError,
  LocalAlphaTasksIsolation,
} from "../../src/alpha-tasks/isolation.ts";
const enabled = process.env.MYAPPS_ALPHA_DOCKER_TEST === "1";
test(
  "actual isolated candidate create/update/list/render persists only explicit returned data",
  { skip: !enabled, timeout: 30000 },
  async () => {
    const f = fixture(),
      runtime = new LocalAlphaTasksIsolation(f.runtime);
    let data = { next: 1, tasks: [] };
    const created = await runtime.execute(
      f.closure,
      "create",
      { title: "Synthetic task", priority: "Low" },
      data,
    );
    data = created.data;
    assert.equal(created.cleanup, "CONFIRMED");
    assert.equal(data.tasks[0].priority, "Low");
    const updated = await runtime.execute(
      f.closure,
      "update",
      { id: 1, patch: { priority: "High" } },
      data,
    );
    data = updated.data;
    assert.equal(
      (await runtime.execute(f.closure, "list", {}, data)).output[0].priority,
      "High",
    );
    assert.match(
      (await runtime.execute(f.closure, "render", {}, data)).output,
      /High/,
    );
  },
);
test(
  "candidate cannot access host secret, mutate source, or connect network",
  { skip: !enabled, timeout: 15000 },
  async () => {
    const f = fixture({
      "src/tasks.js": `import {writeFileSync,readFileSync} from 'node:fs';import net from 'node:net';
 let blocked=0;try{writeFileSync('/candidate/pwned','x')}catch{blocked++}try{readFileSync('/etc/myapps-host-secret')}catch{blocked++}
 if(process.env.MYAPPS_HOST_SECRET)throw Error('secret exposed');await new Promise(resolve=>{const s=net.connect({host:'1.1.1.1',port:80});s.on('connect',()=>{throw Error('network exposed')});s.on('error',()=>{blocked++;resolve()});setTimeout(()=>{s.destroy();resolve()},500)});
 if(blocked!==3)throw Error('isolation failed');export const createStore=()=>({list:()=>[]});`,
    });
    process.env.MYAPPS_HOST_SECRET = "synthetic-not-a-credential";
    try {
      assert.deepEqual(
        (
          await new LocalAlphaTasksIsolation(f.runtime).execute(
            f.closure,
            "list",
            {},
            { next: 1, tasks: [] },
          )
        ).output,
        [],
      );
    } finally {
      delete process.env.MYAPPS_HOST_SECRET;
    }
  },
);

test(
  "candidate failure and timeout return no data and verify exact-container cleanup",
  { skip: !enabled, timeout: 20000 },
  async () => {
    for (const code of ["throw Error('synthetic failure');", "while(true){}"]) {
      const f = fixture({ "src/tasks.js": code });
      await assert.rejects(
        new LocalAlphaTasksIsolation(f.runtime).execute(
          f.closure,
          "list",
          {},
          { next: 1, tasks: [] },
        ),
        (error) =>
          error instanceof IsolatedExecutionError &&
          error.cleanup === "CONFIRMED",
      );
    }
  },
);
