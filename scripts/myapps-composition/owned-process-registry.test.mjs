import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,chmodSync,symlinkSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseProcessIdentity,appendOwnedRegistry,registerOwnedProcess} from './owned-process-registry.mjs';
const line='123 123 Sat Oct 24 04:00:00 2026 /owned/node /owned/entry';
test('spawn PID/group/birth identity is parsed without selecting a global first match',()=>{const x=parseProcessIdentity(line,123);assert.equal(x.pgid,123);assert.equal(x.start,'Sat Oct 24 04:00:00 2026');});
for(const [name,value] of [['foreign PID',line.replace('123 123','456 456')],['foreign group',line.replace('123 123','123 456')],['missing birth','123 123 node /owned/entry']])test('identity rejects '+name,()=>assert.throws(()=>parseProcessIdentity(value,123)));
test('invalid spawn PID fails before tool or filesystem access',()=>assert.throws(()=>registerOwnedProcess({}, {pid:0}),/PID_REQUIRED/));
function fixture(fn){const root=realpathSync(mkdtempSync(join(tmpdir(),'synthetic-owned-registry-'))),path=join(root,'registry');writeFileSync(path,'',{mode:0o600});try{fn(path,root);}finally{rmSync(root,{recursive:true,force:true});}}
test('one private exact registry receives bounded structured ownership evidence',()=>fixture(path=>{appendOwnedRegistry({path},{event:'OPEN',pid:123});assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),{event:'OPEN',pid:123});}));
test('unowned permissions fail before append',()=>fixture(path=>{chmodSync(path,0o644);assert.throws(()=>appendOwnedRegistry({path},{pid:123}));assert.equal(readFileSync(path,'utf8'),'');}));
test('registry alias is rejected',()=>fixture((path,root)=>{const alias=join(root,'alias');symlinkSync('registry',alias);assert.throws(()=>appendOwnedRegistry({path:alias},{pid:123}));assert.equal(readFileSync(path,'utf8'),'');}));
test('oversized row is rejected before any write',()=>fixture(path=>{assert.throws(()=>appendOwnedRegistry({path},{args:['a'.repeat(16384)]}),/REGISTRY_LIMIT/);assert.equal(readFileSync(path,'utf8'),'');}));
