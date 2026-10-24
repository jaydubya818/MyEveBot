/** The actual fixture validation body with TypeScript annotations erased;
 * synthetic inputs only, no fixture/app/SDK module is imported. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../apps/eve/test/owner-journey/current-runtime-fixture.ts',import.meta.url),'utf8');
const start=source.indexOf('export function validateCurrentModelEnvelope('),end=source.indexOf('\n}\n',start)+2;
assert(start>=0&&end>start);
const body=source.slice(start,end).replace('export function','function').replaceAll(':any','');
const validate=vm.runInNewContext(body+'\nvalidateCurrentModelEnvelope',{assert,Buffer,EXTERNAL_ALPHA_INSTRUCTIONS:'reviewed-mandatory-alpha-policy',EXTERNAL_ALPHA_CONTEXT_BYTES:256});
const valid=()=>({prompt:[{role:'system',content:'reviewed-mandatory-alpha-policy'}],tools:[]});
test('reviewed mandatory policy and bounded benign context are accepted',()=>assert.doesNotThrow(()=>validate(valid())));
test('missing mandatory policy cannot become a packaging functional pass',()=>{const value=valid();value.prompt[0].content='other-policy';assert.throws(()=>validate(value),/MANDATORY_ALPHA_POLICY/);});
test('oversized context is rejected',()=>{const value=valid();value.prompt.push({role:'user',content:'a'.repeat(512)});assert.throws(()=>validate(value),/CONTEXT_LIMIT/);});
for(const name of ['engineering_work','engineering_factory'])test('disabled tool is unavailable: '+name,()=>{const value=valid();value.tools=[{name}];assert.throws(()=>validate(value),/DISABLED_WORK_TOOL/);});
