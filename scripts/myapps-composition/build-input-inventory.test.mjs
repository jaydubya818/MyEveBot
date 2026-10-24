import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync,mkdirSync,mkdtempSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {captureBuildInputs,verifyBuildInputs} from './build-input-inventory.mjs';
const hash=body=>createHash('sha256').update(body).digest('hex');
function fixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'build-inputs-')));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const authored={};
 function source(path,body){const target=join(root,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,body);authored[path]=hash(body);}
 source('package-lock.json','{"lockfileVersion":3}');source('apps/eve/agent/agent.ts','// inert source');
 source('packages/local/package.json','{"name":"local"}');
 mkdirSync(join(root,'node_modules/sdk/bin'),{recursive:true});writeFileSync(join(root,'node_modules/sdk/bin/native'),Buffer.from([0,255]));
 symlinkSync('../packages/local',join(root,'node_modules/local'),'dir');
 return {root,authored,capture:()=>captureBuildInputs(root,authored,['node_modules'])};
}
test('complete installed input includes extensionless native bytes and workspace alias',t=>{
 const f=fixture(t),value=f.capture();
 assert.equal(value.status,'BUILD_INPUT_CAPTURE_ONLY_NOT_QUALIFIED');
 assert(value.entries.some(e=>e.path==='node_modules/sdk/bin/native'&&e.bytes===2));
 assert(value.entries.some(e=>e.path==='node_modules/local'&&e.target==='packages/local'));
 assert.equal(verifyBuildInputs(f.root,value).status,'BUILD_INPUTS_UNCHANGED_NOT_QUALIFIED');
});
for(const kind of ['native','new-package','missing-package','permission'])test('installed '+kind+' drift rejected',t=>{
 const f=fixture(t),value=f.capture();
 if(kind==='native')writeFileSync(join(f.root,'node_modules/sdk/bin/native'),'changed');
 if(kind==='new-package'){mkdirSync(join(f.root,'node_modules/injected'));writeFileSync(join(f.root,'node_modules/injected/index.js'),'injected');}
 if(kind==='missing-package')rmSync(join(f.root,'node_modules/sdk'),{recursive:true});
 if(kind==='permission')chmodSync(join(f.root,'node_modules/sdk/bin/native'),0o1644);
 assert.throws(()=>verifyBuildInputs(f.root,value),/INPUT_TREE_CHANGED/);
});
test('a changed tracked lock or authored file cannot become an accepted input',t=>{
 const f=fixture(t);writeFileSync(join(f.root,'package-lock.json'),'changed lock');
 assert.throws(f.capture,/AUTHORED_BYTES_CHANGED/);
});
test('a missing authored file fails instead of silently shrinking the input set',t=>{
 const f=fixture(t);rmSync(join(f.root,'apps/eve/agent/agent.ts'));
 assert.throws(f.capture,/AUTHORED_FILE_MISSING/);
});
test('an added source file or undeclared resolution root cannot hide as a build product',t=>{
 const f=fixture(t);mkdirSync(join(f.root,'apps/eve/agent/node_modules'));
 assert.throws(f.capture,/UNDECLARED_SOURCE_DIRECTORY/);
 rmSync(join(f.root,'apps/eve/agent/node_modules'),{recursive:true});
 writeFileSync(join(f.root,'apps/eve/agent/extra.ts'),'extra');
 assert.throws(f.capture,/UNDECLARED_SOURCE_FILE/);
});
test('only the four declared generated directories are outside the input inventory',t=>{
 const f=fixture(t),value=f.capture();
 for(const name of ['.eve','.output','.next','.nitro']){
  mkdirSync(join(f.root,'apps/eve',name));writeFileSync(join(f.root,'apps/eve',name,'generated'),'generated');
 }
 verifyBuildInputs(f.root,value);
 mkdirSync(join(f.root,'apps/eve/.arbitrary'));
 assert.throws(f.capture,/UNDECLARED_SOURCE_DIRECTORY/);
});
test('an external workspace alias fails before capture',t=>{
 const f=fixture(t);symlinkSync('../../outside',join(f.root,'node_modules/escape'));
 assert.throws(f.capture,/INPUT_ALIAS_INVALID|INPUT_RELATIVE_PATH|INPUT_ALIAS_ESCAPE/);
});
test('missing install roots and aliased install roots are not accepted',t=>{
 const f=fixture(t);rmSync(join(f.root,'node_modules'),{recursive:true});
 assert.throws(f.capture,/INSTALL_ROOT_MISSING/);
 symlinkSync('packages',join(f.root,'node_modules'),'dir');
 assert.throws(f.capture,/INSTALL_ROOT_DIRECTORY_REQUIRED/);
});
test('forged record fields and invented qualification states fail closed',t=>{
 const f=fixture(t),value=f.capture();
 assert.throws(()=>verifyBuildInputs(f.root,{...value,status:'PASS'}),/RECORD_FORMAT/);
 assert.throws(()=>verifyBuildInputs(f.root,{...value,ignore:['native']}),/RECORD_FIELDS/);
});
