import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {applyBrowserRunnerPackaging,reviewedBrowserRunner as m} from './browser-runner.mjs';
const helper=()=>readFileSync(new URL('./owned-browser-fixture.mjs',import.meta.url),'utf8');
const read=(sha,path)=>execFileSync('git',['show',`${sha}:${path}`],{encoding:'utf8'});
test('browser runner retains exact deterministic scenario and provider boundary while guarding owned cleanup',()=>{
 let output;const before=read(m.source,m.path);
 const proof=applyBrowserRunnerPackaging({source:m.source,read,readComposed:path=>path===m.cleanup.helper?helper():before,put:(path,bytes)=>{assert.equal(path,m.path);output=bytes;}});
 const scenario=before.slice(before.indexOf('const key='),before.indexOf('const fixture=createServer('));
 assert(output.includes(scenario),'Original deterministic scenario/provider setup must remain exact');
 const handler=before.split('const fixture=createServer(')[1].split("});\nawait new Promise<void>")[0];
 assert(output.includes(handler),'Original fixture request/assertion boundary must remain exact');
assert.equal(proof.assertions,'UNCHANGED');
});
test('changed runner pin or either source preimage rejects before writing',()=>{
 for(const kind of ['pin','source','composed','helper']){
  let writes=0;
  assert.throws(()=>applyBrowserRunnerPackaging({source:kind==='pin'?'0'.repeat(40):m.source,read:(sha,path)=>read(sha,path)+(kind==='source'?'\n':''),readComposed:path=>path===m.cleanup.helper?helper()+(kind==='helper'?'\n':''):read(m.source,m.path)+(kind==='composed'?'\n':''),put:()=>writes++}),/Unreviewed|Changed/);
  assert.equal(writes,0);
 }
});
test('published Next bin resolves from workspace under both frozen install layouts',t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'myapps-cli-resolution-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const nested of [false,true]){
  const candidate=join(root,String(nested)),app=join(candidate,'apps/eve');mkdirSync(app,{recursive:true});writeFileSync(join(app,'package.json'),'{}');
  const pkg=join(nested?app:candidate,'node_modules/next');mkdirSync(join(pkg,'dist/bin'),{recursive:true});
  writeFileSync(join(pkg,'package.json'),JSON.stringify({name:'next',version:'16.3.8',bin:{next:'./dist/bin/next'}}));writeFileSync(join(pkg,'dist/bin/next'),'// frozen CLI fixture');
  const appRequire=createRequire(join(app,'package.json')),nextPackagePath=appRequire.resolve('next/package.json');
  assert.equal(join(dirname(nextPackagePath),appRequire('next/package.json').bin.next),join(pkg,'dist/bin/next'));
 }
});
