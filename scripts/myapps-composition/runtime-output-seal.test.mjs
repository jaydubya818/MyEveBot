import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,cpSync,mkdirSync,mkdtempSync,realpathSync,renameSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sealRuntimeOutput,verifyRuntimeOutput} from './runtime-output-seal.mjs';

function fixture(t){
 const base=realpathSync(mkdtempSync(join(tmpdir(),'runtime-seal-'))),root=join(base,'server');
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 mkdirSync(root);mkdirSync(join(root,'_virtual'));mkdirSync(join(root,'node_modules'));
 writeFileSync(join(root,'index.mjs'),'export const fixture=true;\n');
 writeFileSync(join(root,'_virtual','eve.schedule.mjs'),'export default "schedule one";\n');
 writeFileSync(join(root,'native.node'),Buffer.from([0,255,1,128]));
 return {base,root};
}

test('complete output includes native bytes, generated schedules, directories and modes without qualification',t=>{
 const {root}=fixture(t),seal=sealRuntimeOutput(root);
 assert.equal(seal.status,'CAPTURE_ONLY_NOT_QUALIFIED');
 assert.equal(seal.entries.find(e=>e.path==='native.node').bytes,4);
 assert(seal.entries.some(e=>e.path==='_virtual/eve.schedule.mjs'));
 assert.equal(verifyRuntimeOutput(root,JSON.parse(JSON.stringify(seal))).status,
  'SEALED_OUTPUT_UNCHANGED_NOT_QUALIFIED');
});
for(const name of ['index.mjs','native.node','_virtual/eve.schedule.mjs'])
 test(`changed bytes fail the original seal: ${name}`,t=>{
  const {root}=fixture(t),seal=sealRuntimeOutput(root);
  writeFileSync(join(root,name),'changed');
  assert.throws(()=>verifyRuntimeOutput(root,seal),/RUNTIME_SEAL_OUTPUT_CHANGED/);
 });
for(const change of ['missing','extra','mode','empty-directory'])
 test(`complete output rejects ${change} drift`,t=>{
  const {root}=fixture(t),seal=sealRuntimeOutput(root);
  if(change==='missing')rmSync(join(root,'native.node'));
  if(change==='extra')writeFileSync(join(root,'injected.mjs'),'throw 1');
  if(change==='mode')chmodSync(join(root,'index.mjs'),0o700);
  if(change==='empty-directory')mkdirSync(join(root,'extra'));
  assert.throws(()=>verifyRuntimeOutput(root,seal),/RUNTIME_SEAL_OUTPUT_CHANGED/);
 });
test('relative in-output package aliases bind exact text and canonical target',t=>{
 const {root}=fixture(t),modules=join(root,'node_modules');
 mkdirSync(join(modules,'.nf3'));mkdirSync(join(modules,'.nf3','estraverse@4'));
 writeFileSync(join(modules,'.nf3','estraverse@4','index.js'),'module.exports=4;');
 symlinkSync('.nf3/estraverse@4',join(modules,'estraverse'),'dir');
 const seal=sealRuntimeOutput(root),alias=seal.entries.find(e=>e.type==='alias');
 assert.equal(alias.text,'.nf3/estraverse@4');
 assert.equal(alias.target,'node_modules/.nf3/estraverse@4');
 verifyRuntimeOutput(root,seal);
 rmSync(join(modules,'estraverse'));symlinkSync('./.nf3/estraverse@4',join(modules,'estraverse'),'dir');
 assert.throws(()=>verifyRuntimeOutput(root,seal),/RUNTIME_SEAL_OUTPUT_CHANGED/);
});
test('alias retargeting to another in-output version fails',t=>{
 const {root}=fixture(t),modules=join(root,'node_modules');
 for(const version of ['v4','v5']){mkdirSync(join(modules,version));writeFileSync(join(modules,version,'index.js'),version);}
 symlinkSync('v4',join(modules,'estraverse'),'dir');const seal=sealRuntimeOutput(root);
 rmSync(join(modules,'estraverse'));symlinkSync('v5',join(modules,'estraverse'),'dir');
 assert.throws(()=>verifyRuntimeOutput(root,seal),/RUNTIME_SEAL_OUTPUT_CHANGED/);
});
for(const kind of ['escape','absolute','cycle','dangling'])
 test(`unsafe ${kind} alias fails before capture`,t=>{
  const {root,base}=fixture(t);writeFileSync(join(base,'outside'),'private');
  const target=kind==='escape'?'../outside':kind==='absolute'?join(base,'outside'):
   kind==='cycle'?'bad':'absent';
  symlinkSync(target,join(root,'bad'));
  assert.throws(()=>sealRuntimeOutput(root),/RUNTIME_SEAL_ALIAS_(ESCAPE|TEXT|INVALID)/);
 });
test('an aliased root cannot masquerade as the owned output directory',t=>{
 const {root,base}=fixture(t);symlinkSync(root,join(base,'alias'),'dir');
 assert.throws(()=>sealRuntimeOutput(join(base,'alias')),/RUNTIME_SEAL_ROOT_REQUIRED/);
});
test('replacement of the original directory fails even for identical file content',t=>{
 const {root}=fixture(t),seal=sealRuntimeOutput(root);renameSync(root,root+'-old');
 cpSync(root+'-old',root,{recursive:true});
 assert.throws(()=>verifyRuntimeOutput(root,seal),/RUNTIME_SEAL_OUTPUT_CHANGED/);
});
test('special permission bits are sealed and later drift cannot be masked',t=>{
 const {root}=fixture(t),seal=sealRuntimeOutput(root);
 // The current Darwin sandbox strips setuid/setgid on chmod. Sticky-bit
 // changes are observable here and were equally invisible to the old mask.
 chmodSync(join(root,'index.mjs'),0o1644);
 assert.throws(()=>verifyRuntimeOutput(root,seal),/RUNTIME_SEAL_OUTPUT_CHANGED/);
 const changed=sealRuntimeOutput(root);
 assert.equal(changed.entries.find(entry=>entry.path==='index.mjs').mode,0o1644);
});
test('modified record and invented qualification status fail closed',t=>{
 const {root}=fixture(t),seal=sealRuntimeOutput(root);
 assert.throws(()=>verifyRuntimeOutput(root,{...seal,totalBytes:0}),/RUNTIME_SEAL_RECORD_CHANGED/);
 assert.throws(()=>verifyRuntimeOutput(root,{...seal,status:'PASS'}),/RUNTIME_SEAL_FORMAT/);
 assert.throws(()=>verifyRuntimeOutput(root,{...seal,ignore:['native.node']}),/RUNTIME_SEAL_FIELDS/);
});
