import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {instrumentEnterpriseConsumer,instrumentEnterpriseResponseFailure,instrumentEnterpriseAdapter,instrumentActionGateway} from './browser/enterprise-diagnostics-overlay.mjs';

test('canonical rejection diagnostics classify exact backend markers without changing denial or exposing bodies',async()=>{
  const root=await mkdtemp(join(tmpdir(),'enterprise-response-diagnostic-')),path=join(root,'response.ts');
  const source="export function response(body: any) { if(body.status!=='success')throw Error('ENTERPRISE_COMMAND_DENIED'); return body.value; }";
  await writeFile(path,instrumentEnterpriseResponseFailure(source));
  const original=console.error,logs=[];console.error=value=>logs.push(String(value));
  try {
    const {response}=await import(pathToFileURL(path).href),value={secret:'REVIEW_SECRET_SENTINEL'};
    assert.equal(response({status:'success',value}),value);assert.deepEqual(logs,[]);
    for(const [message,code] of [
      ['[Request ID: REVIEW_SECRET_SENTINEL] Server Error\nFunction execution timed out (maximum duration: 1s)\n','CONVEX_FUNCTION_TIMEOUT_1S'],
      ['ENTERPRISE_ACCESS_DENIED','ENTERPRISE_ACCESS_DENIED'],['ENTERPRISE_PLAN_STALE','ENTERPRISE_PLAN_STALE'],
      ['Function execution timed out (maximum duration: 2s)','UNCLASSIFIED_BACKEND_ERROR'],
      ['REVIEW_SECRET_SENTINEL Function execution timed out (maximum duration: 1s)','UNCLASSIFIED_BACKEND_ERROR'],
      ['REVIEW_SECRET_SENTINEL','UNCLASSIFIED_BACKEND_ERROR'],
    ]) {
      assert.throws(()=>response({status:'error',errorMessage:message}),{message:'ENTERPRISE_COMMAND_DENIED'});
      assert.deepEqual(JSON.parse(logs.at(-1).slice('[enterprise-fixture-diagnostic] '.length)),{phase:'canonicalResponse',outcome:'FAIL',code,elapsedMs:null});
    }
    let reads=0,coercions=0;
    assert.throws(()=>response({status:'error',get errorMessage(){reads++;return reads===1?'ENTERPRISE_ACCESS_DENIED':'REVIEW_SECRET_SENTINEL';}}),{message:'ENTERPRISE_COMMAND_DENIED'});
    assert.equal(reads,1);
    assert.throws(()=>response({status:'error',errorMessage:{toString(){coercions++;return 'REVIEW_SECRET_SENTINEL';}}}),{message:'ENTERPRISE_COMMAND_DENIED'});
    assert.equal(coercions,0);assert.equal(logs.join('').includes('REVIEW_SECRET_SENTINEL'),false);
    assert.throws(()=>response({status:'error',get errorMessage(){throw Error('REVIEW_SECRET_SENTINEL');}}),{message:'ENTERPRISE_COMMAND_DENIED'});
    console.error=()=>{throw Error('REVIEW_SECRET_SENTINEL');};
    assert.throws(()=>response({status:'error',errorMessage:'ENTERPRISE_ACCESS_DENIED'}),{message:'ENTERPRISE_COMMAND_DENIED'});
    assert.throws(()=>instrumentEnterpriseResponseFailure(''));assert.throws(()=>instrumentEnterpriseResponseFailure(source+source));
    assert.throws(()=>instrumentEnterpriseResponseFailure(instrumentEnterpriseResponseFailure(source)));
  } finally {console.error=original;await rm(root,{recursive:true,force:true});}
});

async function fixture(fn) {
  const root=await mkdtemp(join(tmpdir(),'enterprise-diagnostic-test-'));
  const path=join(root,'consumer.ts');
  await writeFile(path,instrumentEnterpriseConsumer('export async function sendEnterpriseCommand(value: unknown, fail=false) { if(fail)throw value; return value; }'));
  const original=console.error,logs=[];console.error=value=>logs.push(String(value));
  try {await fn(await import(pathToFileURL(path).href),logs);}
  finally {console.error=original;await rm(root,{recursive:true,force:true});}
}

test('diagnostic overlay preserves exact successful response and emits nothing',async()=>fixture(async(module,logs)=>{
  const response={secret:'must-stay-private'};assert.equal(await module.sendEnterpriseCommand(response),response);assert.deepEqual(logs,[]);
}));
test('diagnostic overlay preserves original error and logs only an allowlisted code',async()=>fixture(async(module,logs)=>{
  const error=new Error('ENTERPRISE_RESULT_AUTHENTICATION');error.signature='secret-signature';
  await assert.rejects(()=>module.sendEnterpriseCommand(error,true),caught=>caught===error);
  const report=JSON.parse(logs[0].slice('[enterprise-fixture-diagnostic] '.length));
  assert.deepEqual(Object.keys(report).sort(),['code','elapsedMs','outcome','phase']);assert.equal(report.code,'ENTERPRISE_RESULT_AUTHENTICATION');assert.ok(report.elapsedMs>=0);
  assert.equal(logs.join('').includes('secret-signature'),false);
}));
test('unclassified messages, error properties and non-Error values never leak',async()=>fixture(async(module,logs)=>{
  for(const error of [Object.assign(new Error('secret-cookie'),{token:'secret-token'}),{signature:'secret-signature'},'secret-password']) {
    await assert.rejects(()=>module.sendEnterpriseCommand(error,true),caught=>caught===error);
  }
  assert.equal(logs.length,3);for(const log of logs){assert.equal(log.includes('secret-'),false);assert.equal(JSON.parse(log.slice('[enterprise-fixture-diagnostic] '.length)).code,'UNCLASSIFIED');}
}));
test('diagnostics snapshot getters once and never coerce error property objects',async()=>fixture(async(module,logs)=>{
  for(const [field,allowed,expected] of [['message','ENTERPRISE_RESULT_BINDING','ENTERPRISE_RESULT_BINDING'],['name','TimeoutError','TimeoutError'],['code','23505','POSTGRES_23505'],['status','denied','ACTION_DENIED']]) {
    const error=new Error('unknown');let reads=0;
    Object.defineProperty(error,field,{get(){return ++reads===1?allowed:'REVIEW_SECRET_SENTINEL';}});
    await assert.rejects(()=>module.sendEnterpriseCommand(error,true),caught=>caught===error);
    assert.equal(reads,1);
    assert.equal(JSON.parse(logs.at(-1).slice('[enterprise-fixture-diagnostic] '.length)).code,expected);
  }
  let coercions=0;
  const object={toString(){coercions++;return 'REVIEW_SECRET_SENTINEL';},[Symbol.toPrimitive](){coercions++;return 'REVIEW_SECRET_SENTINEL';}};
  const error=new Error('unknown');for(const field of ['message','name','code','status'])Object.defineProperty(error,field,{value:object});
  await assert.rejects(()=>module.sendEnterpriseCommand(error,true),caught=>caught===error);
  assert.equal(coercions,0);assert.equal(logs.join('').includes('REVIEW_SECRET_SENTINEL'),false);
  assert.equal(JSON.parse(logs.at(-1).slice('[enterprise-fixture-diagnostic] '.length)).code,'UNCLASSIFIED');
}));
test('overlay rejects missing, duplicate or already-instrumented command exports',()=>{
  const source='export async function sendEnterpriseCommand() {}';
  assert.throws(()=>instrumentEnterpriseConsumer(''));
  assert.throws(()=>instrumentEnterpriseConsumer(source+source));
  assert.throws(()=>instrumentEnterpriseConsumer(instrumentEnterpriseConsumer(source)));
});
test('adapter diagnostics preserve arguments, receiver, results and verification errors',async()=>{
  const root=await mkdtemp(join(tmpdir(),'enterprise-adapter-diagnostic-test-')),path=join(root,'adapter.ts');
  await writeFile(path,instrumentEnterpriseAdapter('export function enterpriseAdapter(adapter: any) { return adapter; }'));
  const original=console.error,logs=[];console.error=value=>logs.push(String(value));
  try {
    const module=await import(pathToFileURL(path).href),parameters={secret:'request-token'},authority={secret:'authority-token'},receipt={secret:'receipt-token'};
    const error=new Error('ENTERPRISE_RESULT_BINDING');
    const adapter={execute:async function(p,a){assert.equal(this,adapter);assert.equal(p,parameters);assert.equal(a,authority);return receipt;},verify:async function(r){assert.equal(this,adapter);assert.equal(r,receipt);throw error;}};
    assert.equal(module.enterpriseAdapter(adapter),adapter);
    assert.equal(await adapter.execute(parameters,authority),receipt);
    const other={execute:adapter.execute,verify:adapter.verify};
    const dynamic=module.enterpriseAdapter({execute:async function(){return this;},verify:async function(){return this;}});
    assert.equal(await dynamic.execute.call(other),other);assert.equal(await dynamic.verify.call(other),other);
    for(const method of ['execute','verify']) {
      const incompatible={execute:async()=>receipt,verify:async()=>receipt,[method]:()=>receipt};
      assert.throws(()=>module.enterpriseAdapter(incompatible),{message:'FIXTURE_ADAPTER_ASYNC_CONTRACT_REQUIRED'});
    }
    await assert.rejects(()=>adapter.verify(receipt),caught=>caught===error);
    const reports=logs.map(log=>JSON.parse(log.slice('[enterprise-fixture-diagnostic] '.length)));
    assert.deepEqual(reports.map(({phase,outcome,code})=>({phase,outcome,code})),[{phase:'adapter.execute',outcome:'PASS',code:'NONE'},{phase:'adapter.execute',outcome:'PASS',code:'NONE'},{phase:'adapter.verify',outcome:'PASS',code:'NONE'},{phase:'adapter.verify',outcome:'FAIL',code:'ENTERPRISE_RESULT_BINDING'}]);
    assert.equal(logs.join('').includes('-token'),false);
  } finally {console.error=original;await rm(root,{recursive:true,force:true});}
});
test('gateway diagnostics preserve recovery recording and outward error while redacting database details',async()=>{
  const root=await mkdtemp(join(tmpdir(),'enterprise-gateway-diagnostic-test-')),path=join(root,'gateway.ts');
  const source=`export const outward=new Error('canonical outward error');
function ActionBlocked(){return outward;}
export class Gateway {
  records:any[]=[];
  async record(...args:any[]){this.records.push(args);}
  async run(error:unknown){const action={ownerId:'secret-owner'},actionId='secret-action';try{throw error;
    } catch {
      await this.record(action.ownerId,actionId,"result_unknown",{});
      throw new ActionBlocked("result_unknown",actionId);
    }
  }
}`;
  await writeFile(path,instrumentActionGateway(source));
  const original=console.error,logs=[];console.error=value=>logs.push(String(value));
  try {
    const module=await import(pathToFileURL(path).href),gateway=new module.Gateway();
    const failure=Object.assign(new Error('secret database detail'),{code:'23505',detail:'secret-row'});
    await assert.rejects(()=>gateway.run(failure),error=>error===module.outward);
    assert.deepEqual(gateway.records,[['secret-owner','secret-action','result_unknown',{}]]);
    assert.equal(logs.length,1);assert.equal(logs[0].includes('secret'),false);
    assert.deepEqual(JSON.parse(logs[0].slice('[enterprise-fixture-diagnostic] '.length)),{phase:'ActionGateway.run',outcome:'FAIL',code:'POSTGRES_23505',elapsedMs:null});
    assert.throws(()=>instrumentActionGateway(instrumentActionGateway(source)));
  } finally {console.error=original;await rm(root,{recursive:true,force:true});}
});
test('generated typed adapter preserves separate execute and verify method contracts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'enterprise-adapter-types-'));
  try {
    await writeFile(join(root,'adapter.ts'),instrumentEnterpriseAdapter(`
type Receipt={verified:boolean;receipt:Record<string,unknown>};
type Response={data:string};
type Adapter={execute(parameters:Record<string,unknown>,authority:{signal:AbortSignal}):Promise<Response>;verify(result:Response,target:{id:string}):Promise<Receipt>};
export function enterpriseAdapter(adapter:Adapter):Adapter{return adapter;}
`));
    await writeFile(join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'esnext',types:[],skipLibCheck:true},files:['adapter.ts']}));
    execFileSync(process.execPath,[fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc',import.meta.url)),'--project',join(root,'tsconfig.json')],{stdio:'pipe'});
  } finally {await rm(root,{recursive:true,force:true});}
});
