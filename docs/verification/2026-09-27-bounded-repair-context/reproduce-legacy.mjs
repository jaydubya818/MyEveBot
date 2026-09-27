// Run from repository root: node --import tsx <this file>.
// Offline pure-function reconstruction; no database, authority, or provider use.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const directory=await mkdtemp(join(tmpdir(),'repair-legacy-analysis-'));
try {
 let source=execFileSync('git',['show','84be8db:apps/eve/lib/engineering/native-model.ts'],{encoding:'utf8'});
 source=source.replaceAll('from "./','from "'+root+'/apps/eve/lib/engineering/').replace('from "ai"','from "'+root+'/node_modules/ai/dist/index.js"').replace('from "zod"','from "'+root+'/node_modules/zod/index.js"');
 // Remove only the pre-dispatch size throw to observe the rejected pure payload.
 const begin=source.indexOf('  if(Buffer.byteLength(JSON.stringify({prompt:scoped.prompt'),end=source.indexOf('  return scoped;',begin);
 assert(begin>0&&end>begin);source=source.slice(0,begin)+source.slice(end);
 const module=join(directory,'legacy.ts');await writeFile(module,source);
 const {completionModelOptions}=await import(pathToFileURL(module).href);
 const fixture=root+'/apps/eve/test/fixtures/repair-context/';
 const a=JSON.parse(await readFile(fixture+'inputs.json','utf8')),expected=JSON.parse(await readFile(fixture+'legacy-payload.json','utf8'));
 const actual=completionModelOptions(a.options,a.config,a.state,a.truth,a.metadata);
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);const bytes=Buffer.byteLength(JSON.stringify({prompt:actual.prompt,tools:actual.tools}))+4096;assert.equal(bytes,16040);
 console.log(JSON.stringify({reproducedBytes:bytes,exactPayloadMatch:true,providerCalls:0,authorityChanges:0}));
}finally{await rm(directory,{recursive:true,force:true});}
