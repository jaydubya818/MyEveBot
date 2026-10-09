import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("canonical integration cannot automatically deploy MyEve Production", async()=>{
 const config=JSON.parse(await readFile(new URL("../vercel.json",import.meta.url),"utf8"));
 assert.equal(config.git.deploymentEnabled.main,false);
 assert.equal(config.git.deploymentEnabled["codex/federation-final-consolidation"],false);
});
