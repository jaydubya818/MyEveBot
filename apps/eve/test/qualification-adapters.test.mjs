/** Adapter tests against disabled/fake transports. No network, credentials or provider. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {RelayMcpTransport,RelayMcpError} from '../lib/qualification/relay-mcp-transport.ts';
import {RelayDeveloperTools} from '../lib/qualification/relay-tools.ts';
import {RelayDenied} from '../lib/qualification/relay-grant.ts';
import {QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';

const SECRET='rly_synthetic_secret_value';
const grant=()=>({connectionId:'synthetic-connection',repository:QDEV_BASELINE.repository,baseCommit:QDEV_BASELINE.inputCommit,outputBranch:QDEV_BASELINE.outputBranch,
 permissions:{metadata:'read',contents:'write',actions:'read',deployments:'read'},repositoryAdmin:false,workflowEdit:false,productionDeployment:false});
const tools={github_read_file:'read_contents',github_write_file:'write_contents'};
/** Minimal Relay /mcp double: HTTP 200 JSON-RPC errors for denials, 401 for credentials. */
function relay({credential=SECRET,granted=['github_read_file','github_write_file','memory_add'],hook}={}){
 const seen=[];
 const fetcher=async(url,init)=>{
  seen.push({url:String(url),method:init.method,redirect:init.redirect,auth:init.headers.authorization});
  if(init.headers.authorization!=='Bearer '+credential)return new Response('{}',{status:401});
  const rpc=JSON.parse(init.body),ok=r=>Response.json({jsonrpc:'2.0',id:rpc.id,result:r}),err=(code)=>Response.json({jsonrpc:'2.0',id:rpc.id,error:{code:-32003,message:'denied',data:{code}}});
  if(hook){const r=hook(rpc);if(r)return r;}
  if(rpc.method==='initialize')return ok({protocolVersion:'2024-11-05'});
  if(rpc.method==='tools/list')return ok({tools:granted.map(name=>({name}))});
  if(rpc.method==='tools/call'){return granted.includes(rpc.params.name)?ok({content:[{type:'text',text:'done'}]}):err('CAPABILITY_DENIED');}
  return err('METHOD_NOT_FOUND');
 };
 return {seen,fetcher};
}
const make=(over={},r=relay())=>({r,t:new RelayMcpTransport({enabled:true,origin:'https://relay.invalid',credential:async()=>SECRET,tools,fetcher:r.fetcher,...over})});

test('a disabled transport performs no I/O',async()=>{
  const r=relay();const t=new RelayMcpTransport({enabled:false,origin:'https://relay.invalid',credential:async()=>SECRET,tools,fetcher:r.fetcher});
  await assert.rejects(t.discover(),e=>e.code==='QDEV_RELAY_MCP_DISABLED');
  await assert.rejects(t.execute('github_read_file',{}),e=>e.code==='QDEV_RELAY_MCP_DISABLED');
  assert.equal(r.seen.length,0);
});
test('configuration must be a bare https origin',()=>{
  for(const origin of ['http://relay.invalid','https://user:pw@relay.invalid','https://relay.invalid/path'])
    assert.throws(()=>new RelayMcpTransport({enabled:true,origin,credential:async()=>SECRET,tools}),RelayMcpError,origin);
});
test('discovery exposes only host-mapped tools and always posts to /mcp with bearer auth and no redirects',async()=>{
  const {r,t}=make();
  assert.deepEqual((await t.discover()).map(x=>x.name),['github_read_file','github_write_file']);
  assert(r.seen.every(s=>s.url==='https://relay.invalid/mcp'&&s.method==='POST'&&s.redirect==='error'&&s.auth==='Bearer '+SECRET));
  assert(!r.seen.some(s=>s.url.includes('/api/v2')));
});
test('a JSON-RPC denial returned with HTTP 200 is a denial, never a success',async()=>{
  const {t}=make({},relay({granted:['github_read_file']}));
  await assert.rejects(t.execute('github_write_file',{}),e=>e.code==='QDEV_RELAY_CAPABILITY_DENIED');
});
test('credential failures map to a fixed code and the secret never appears in any error',async()=>{
  const {t}=make({credential:async()=>'rly_wrong'});
  const err=await t.discover().then(()=>null,e=>e);
  assert.equal(err.code,'QDEV_RELAY_CREDENTIAL');assert(!String(err.message).includes(SECRET)&&!String(err.message).includes('rly_wrong'));
  const boom=make({fetcher:async()=>{throw new Error('connect ECONNREFUSED with '+SECRET);}});
  const e2=await boom.t.discover().then(()=>null,e=>e);
  assert.equal(e2.code,'QDEV_RELAY_UNAVAILABLE');assert(!String(e2.message).includes(SECRET));
});
test('malformed, oversized and error-flagged responses fail closed',async()=>{
  assert.equal((await make({},relay({hook:()=>new Response('not json')})).t.discover().then(()=>null,e=>e)).code,'QDEV_RELAY_INVALID_RESPONSE');
  assert.equal((await make({maxBytes:10},relay()).t.discover().then(()=>null,e=>e)).code,'QDEV_RELAY_RESPONSE_TOO_LARGE');
  const flagged=relay({hook:rpc=>rpc.method==='tools/call'?Response.json({jsonrpc:'2.0',id:rpc.id,result:{isError:true,content:[]}}):null});
  assert.equal((await make({},flagged).t.execute('github_read_file',{}).then(()=>null,e=>e)).code,'QDEV_RELAY_TOOL_ERROR');
  assert.equal((await make().t.execute('memory_add',{}).then(()=>null,e=>e)).code,'QDEV_RELAY_TOOL_UNMAPPED');
});
test('through RelayDeveloperTools the grant is checked before Relay is contacted, and permitted calls reach /mcp',async()=>{
  const {r,t}=make();const dev=new RelayDeveloperTools(grant(),t);
  const [read,write]=await dev.discover();
  const before=r.seen.length;
  await assert.rejects(dev.execute(write,{branch:'main',path:'a'}),RelayDenied);
  assert.equal(r.seen.length,before);
  assert.deepEqual(await dev.execute(write,{branch:QDEV_BASELINE.outputBranch,path:'src/a.ts'}),[{type:'text',text:'done'}]);
});

test('malformed MCP replies fail closed: wrong id, missing/duplicate result-error, extra keys, wrong result shape',async()=>{
  const cases={
    wrongId:rpc=>Response.json({jsonrpc:'2.0',id:rpc.id+999,result:{content:[]}}),
    nullId:rpc=>Response.json({jsonrpc:'2.0',id:null,result:{content:[]}}),
    neither:rpc=>Response.json({jsonrpc:'2.0',id:rpc.id}),
    both:rpc=>Response.json({jsonrpc:'2.0',id:rpc.id,result:{content:[]},error:{code:-1,message:'x'}}),
    extraKey:rpc=>Response.json({jsonrpc:'2.0',id:rpc.id,result:{content:[]},extra:1}),
    nullResult:rpc=>Response.json({jsonrpc:'2.0',id:rpc.id,result:null}),
    noContent:rpc=>Response.json({jsonrpc:'2.0',id:rpc.id,result:{}}),
    arrayBody:()=>Response.json([]),
    badError:rpc=>Response.json({jsonrpc:'2.0',id:rpc.id,error:'nope'}),
  };
  for(const [name,reply] of Object.entries(cases)){
    const {t}=make({},relay({hook:rpc=>rpc.method==='tools/call'?reply(rpc):undefined}));
    await assert.rejects(t.execute('github_read_file',{}),e=>e instanceof RelayMcpError&&e.code==='QDEV_RELAY_INVALID_RESPONSE',name);
  }
  const {t:bad}=make({},relay({hook:rpc=>rpc.method==='initialize'?Response.json({jsonrpc:'2.0',id:rpc.id,result:{}}):undefined}));
  await assert.rejects(bad.discover(),e=>e.code==='QDEV_RELAY_INVALID_RESPONSE');
  const {t:ok}=make();assert.deepEqual(await ok.execute('github_read_file',{}),[{type:'text',text:'done'}]);
});
