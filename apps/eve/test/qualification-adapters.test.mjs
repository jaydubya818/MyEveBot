/** Adapter tests against disabled/fake transports. No network, credentials or provider. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {RelayMcpTransport,RelayMcpError} from '../lib/qualification/relay-mcp-transport.ts';
import {RelayDeveloperTools} from '../lib/qualification/relay-tools.ts';
import {RelayDenied} from '../lib/qualification/relay-grant.ts';
import {QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {CANONICAL_RELAY_CONTRACT,relayToolMap} from '../lib/qualification/relay-tool-contract.ts';

const SECRET='rly_synthetic_secret_value';
const grant=()=>({connectionId:'synthetic-connection',repository:QDEV_BASELINE.repository,baseCommit:QDEV_BASELINE.inputCommit,outputBranch:QDEV_BASELINE.outputBranch,
 permissions:{metadata:'read',contents:'write',actions:'read',deployments:'read'},repositoryAdmin:false,workflowEdit:false,productionDeployment:false});
const tools=relayToolMap();
const CANON=Object.keys(CANONICAL_RELAY_CONTRACT);
/** Minimal Relay /mcp double: HTTP 200 JSON-RPC errors for denials, 401 for credentials. */
function relay({credential=SECRET,granted=[...CANON,'relay_memory_add'],hook}={}){
 const seen=[];
 const fetcher=async(url,init)=>{
  seen.push({url:String(url),method:init.method,redirect:init.redirect,auth:init.headers.authorization,body:JSON.parse(init.body)});
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
  await assert.rejects(t.execute('relay_github_repo_get',{}),e=>e.code==='QDEV_RELAY_MCP_DISABLED');
  assert.equal(r.seen.length,0);
});
test('configuration must be a bare https origin',()=>{
  for(const origin of ['http://relay.invalid','https://user:pw@relay.invalid','https://relay.invalid/path'])
    assert.throws(()=>new RelayMcpTransport({enabled:true,origin,credential:async()=>SECRET,tools}),RelayMcpError,origin);
});
test('discovery exposes only host-mapped tools and always posts to /mcp with bearer auth and no redirects',async()=>{
  const {r,t}=make();
  assert.deepEqual((await t.discover()).map(x=>x.name),CANON);
  assert(r.seen.every(s=>s.url==='https://relay.invalid/mcp'&&s.method==='POST'&&s.redirect==='error'&&s.auth==='Bearer '+SECRET));
  assert(!r.seen.some(s=>s.url.includes('/api/v2')));
});
test('a JSON-RPC denial returned with HTTP 200 is a denial, never a success',async()=>{
  const {t}=make({},relay({granted:['relay_github_repo_get']}));
  await assert.rejects(t.execute('relay_github_branch_get',{owner:'o',repo:'r',branch:'main'}),e=>e.code==='QDEV_RELAY_CAPABILITY_DENIED');
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
  assert.equal((await make({},flagged).t.execute('relay_github_repo_get',{}).then(()=>null,e=>e)).code,'QDEV_RELAY_TOOL_ERROR');
  assert.equal((await make().t.execute('relay_memory_add',{}).then(()=>null,e=>e)).code,'QDEV_RELAY_TOOL_UNMAPPED');
});
const repoOf=QDEV_BASELINE.repository,[ownerOf,nameOf]=repoOf.split('/');
const callArgs=r=>r.seen.filter(x=>x.body.method==='tools/call').map(x=>({name:x.body.params.name,args:x.body.params.arguments}));
test('through RelayDeveloperTools only the supported canonical tools are visible and native selectors come from the authorized repository',async()=>{
  const {r,t}=make();const dev=new RelayDeveloperTools(grant(),t);
  const tools_=await dev.discover();
  assert.deepEqual(tools_.map(x=>x.name),CANON,'exactly the frozen-Relay supported reads');
  const by=n=>tools_.find(x=>x.name===n);
  await dev.execute(by('relay_github_repo_get'),{});
  await dev.execute(by('relay_github_branch_get'),{branch:'main'});
  await dev.execute(by('relay_github_run_list'),{branch:QDEV_BASELINE.outputBranch,headSha:'a'.repeat(40),page:1,perPage:50});
  await dev.execute(by('relay_github_run_get'),{runId:'123'});
  await dev.execute(by('relay_github_deployment_status_list'),{deploymentId:'9',perPage:10});
  assert.deepEqual(callArgs(r),[
    {name:'relay_github_repo_get',args:{owner:ownerOf,repo:nameOf}},
    {name:'relay_github_branch_get',args:{owner:ownerOf,repo:nameOf,branch:'main'}},
    {name:'relay_github_run_list',args:{owner:ownerOf,repo:nameOf,branch:QDEV_BASELINE.outputBranch,headSha:'a'.repeat(40),page:1,perPage:50}},
    {name:'relay_github_run_get',args:{owner:ownerOf,repo:nameOf,runId:'123'}},
    {name:'relay_github_deployment_status_list',args:{owner:ownerOf,repo:nameOf,deploymentId:'9',perPage:10}}]);
});
test('R3: caller-supplied provider selectors, aliases and malformed fields are denied before Relay is contacted',async()=>{
  const {r,t}=make();const dev=new RelayDeveloperTools(grant(),t);
  const by=n=>dev.discover().then(ts=>ts.find(x=>x.name===n));
  const bad=[
    ['relay_github_repo_get',{owner:'foreign-owner',repo:'private-other-repo'}],
    ['relay_github_repo_get',{repository:'foreign-owner/private-other-repo'}],
    ['relay_github_repo_get',{repository:repoOf}],
    ['relay_github_repo_get',{owner:ownerOf,repo:nameOf}],
    ['relay_github_branch_get',{branch:'main',owner:'foreign-owner'}],
    ['relay_github_branch_get',{branch:'main',Repo:'x'}],
    ['relay_github_branch_get',{}],
    ['relay_github_branch_get',{branch:'../x'.repeat(100)}],
    ['relay_github_run_get',{runId:'0'}],
    ['relay_github_run_get',{runId:'12',repo:'other'}],
    ['relay_github_run_list',{created:'2026-01-01T00:00:00Z..2026-03-01T00:00:00Z'}],
    ['relay_github_run_list',{perPage:1000}],
    ['relay_github_deployment_list',{sha:'XYZ'}],
    ['relay_github_deployment_status_list',{deploymentId:'abc'}],
  ];
  for(const [name,args] of bad)
    await assert.rejects(dev.execute(await by(name),args),e=>e instanceof RelayDenied&&e.code==='QDEV_RELAY_INPUT_DENIED',name+' '+JSON.stringify(args));
  assert.deepEqual(callArgs(r),[],'no tools/call reached Relay');
});
test('tools outside the supported contract are unsupported even if Relay lists them or the caller names them',async()=>{
  const {t}=make();const dev=new RelayDeveloperTools(grant(),t);
  await assert.rejects(dev.execute({name:'relay_memory_add',kind:'read_metadata'},{}),e=>e.code==='QDEV_RELAY_TOOL_UNSUPPORTED');
  await assert.rejects(dev.execute({name:'relay_github_repo_get',kind:'write_contents'},{}),e=>e.code==='QDEV_RELAY_TOOL_UNSUPPORTED');
  await assert.rejects(dev.execute({name:'github_write_file',kind:'write_contents'},{}),e=>e.code==='QDEV_RELAY_TOOL_UNSUPPORTED');
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
    await assert.rejects(t.execute('relay_github_repo_get',{}),e=>e instanceof RelayMcpError&&e.code==='QDEV_RELAY_INVALID_RESPONSE',name);
  }
  const {t:bad}=make({},relay({hook:rpc=>rpc.method==='initialize'?Response.json({jsonrpc:'2.0',id:rpc.id,result:{}}):undefined}));
  await assert.rejects(bad.discover(),e=>e.code==='QDEV_RELAY_INVALID_RESPONSE');
  const {t:ok}=make();assert.deepEqual(await ok.execute('relay_github_repo_get',{}),[{type:'text',text:'done'}]);
});
