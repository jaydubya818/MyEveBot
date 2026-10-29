import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { validateRuntime } from "../src/alpha-tasks/contracts.ts";
import { fixture } from "./alpha-tasks/fixtures.mjs";

test("runtime validation returns the exact image it checked despite an accessor", () => {
  const { runtime } = fixture();
  const expected = runtime.image;
  let reads = 0;
  Object.defineProperty(runtime, "image", { enumerable: true, get() { return ++reads <= 2 ? expected : "unapproved-mutable-image:latest"; } });
  assert.equal(validateRuntime(runtime).image, expected);
});

const setup = `
import assert from 'node:assert/strict';
import {LocalAlphaTasksIsolation} from './packages/myapps/src/alpha-tasks/isolation.ts';
import {fixture} from './packages/myapps/test/alpha-tasks/fixtures.mjs';
import {digest} from './packages/myapps/src/alpha-tasks/contracts.ts';
const f=fixture(), runtime=new LocalAlphaTasksIsolation(f.runtime), commands=[];
const expected=f.runtime.image, expectedDigest=digest(f.runtime), id='12345678-1234-4234-8234-123456789abc';
// Stub only the side-effecting Docker transport; exercise real validation, source
// reconstruction, adapter fingerprint, launch construction and cleanup fencing.
runtime.command=async args=>{commands.push(args);if(args[0]==='start')return {code:0,stdout:JSON.stringify({output:[],data:{next:1,tasks:[]}}),stderr:''};if(args[0]==='inspect')return {code:1,stdout:'',stderr:'No such object: myapps-alpha-'+id};return {code:0,stdout:'',stderr:''};};
const change=()=>{for(const mutate of [()=>{runtime.profile.image='unapproved-mutable-image:latest';},()=>{runtime.profile.secrets.push('unapproved-secret');},()=>{runtime.profile={...f.runtime,image:'unapproved-mutable-image:latest'};}]){try{mutate();}catch{}}};
`;
function check(body) {
  // Node's transform mode supports the existing TypeScript parameter properties.
  // No Docker, candidate module, network, database or financial operation runs.
  execFileSync(process.execPath, ["--experimental-transform-types", "--input-type=module", "-e", setup + body], {
    cwd: new URL("../../../", import.meta.url),
    env: { PATH: process.env.PATH ?? "" },
    stdio: "pipe",
    timeout: 10000,
  });
}

test("runtime image, secrets and retained profile cannot change after construction", () => {
  check(`change();const result=await runtime.execute(f.closure,'list',{}, {next:1,tasks:[]},id);assert.ok(commands.find(a=>a[0]==='create').includes(expected));assert.equal(result.runtimeDigest,expectedDigest);assert.deepEqual(runtime.profile.secrets,[]);`);
});

test("an asynchronous caller cannot replace runtime pins while source checks await", () => {
  check(`const pending=runtime.execute(f.closure,'list',{}, {next:1,tasks:[]},id);queueMicrotask(change);const result=await pending;assert.ok(commands.find(a=>a[0]==='create').includes(expected));assert.equal(result.runtimeDigest,expectedDigest);`);
});
