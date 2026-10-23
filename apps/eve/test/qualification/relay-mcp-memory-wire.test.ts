// Run a copied test in the exact selected Relay source's existing Vitest setup.
// The real MyEve module runs in a separate tsx child with its own schema/Neon bridge.
import {expect,test,afterAll} from 'vitest';
import {createServer} from 'node:https';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync,writeFileSync} from 'node:fs';
import {POST} from '@/app/mcp/route';
import {createAgent,rotateCredential} from '@/lib/agents';
import {listActivity} from '@/lib/activity';
import {freshDatabase,secondAccount,cleanupDatabase} from './tests/helpers';
afterAll(cleanupDatabase);

test('MyEve canonical resolver and bounded SDK use actual selected Relay over disposable TLS/SQL',async()=>{
  const {accountId}=await freshDatabase();const other=await secondAccount();
  const a={...await createAgent(accountId,{name:'MyEve fixture A',capabilities:['memory.read','memory.write']}),accountId};
  const b={...await createAgent(other,{name:'MyEve fixture B',capabilities:['memory.read','memory.write']}),accountId:other};
  const source=process.env.MYEVE_MCP_SOURCE!;
  expect(source).toBe('/tmp/myeve-auth-password-management');
  const tls='/tmp/myeve-relay-mcp-tls-20261023';
  let mode='real',cookieObserved=false,wrongPath=false,result:any,childError='',boundaryId=0;
  const counts:Record<string,Record<string,number>>={};
  const listResultCounts:Record<string,number[]>={};
  const child=fork(`${source}/apps/eve/test/relay-mcp-memory.integration.mjs`,{cwd:source,execArgv:['--import','tsx'],
    env:{PATH:process.env.PATH,NODE_ENV:'test',NODE_EXTRA_CA_CERTS:`${tls}/cert.pem`,RELAY_TEST_DATABASE_URL:process.env.RELAY_TEST_DATABASE_URL},silent:true});
  child.stdout?.on('data',data=>process.stdout.write(data));child.stderr?.on('data',data=>{childError+=String(data)});
  const boundary=async(name:string)=>{
    const id=++boundaryId;
    const rotation=name==='rotate'?await rotateCredential(accountId,a.agentId):undefined;
    if(rotation)a.credential=rotation.secret;
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{child.off('message',handler);reject(new Error('Fixture boundary timeout'))},3000);
      const handler=(msg:any)=>{if(msg.id!==id||!['boundary-done','boundary-failed'].includes(msg.type))return;clearTimeout(timer);child.off('message',handler);msg.type==='boundary-done'?resolve():reject(new Error('Fixture boundary failed'));};
      child.on('message',handler);child.send({type:'boundary',name,id,...(rotation?{credential:rotation.secret}:{})});
    });
  };
  const server=createServer({key:readFileSync(`${tls}/key.pem`),cert:readFileSync(`${tls}/cert.pem`)},async(req,res)=>{
    try{
      wrongPath ||= req.url!=='/mcp';cookieObserved ||= !!req.headers.cookie;
      if(req.method!=='POST'||req.url!=='/mcp'){res.writeHead(405);res.end();return;}
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=Buffer.concat(chunks).toString();const rpc=JSON.parse(body);
      const active=mode;counts[active]??={};counts[active][rpc.method]=(counts[active][rpc.method]??0)+1;
      if(active==='init-202'&&rpc.method==='initialize'){res.writeHead(202,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'relay',version:'0.1.0'}}}));return;}
      if(active==='init-wrong-id'&&rpc.method==='initialize'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:'unrelated',result:{}}));return;}
      if((active==='hold-initialize'&&rpc.method==='initialize')||(active==='hold-list'&&rpc.method==='tools/list'))return;
      if(['rotate','revoke','cancel-run','policy-denied','abort-before-call'].includes(active)&&rpc.method==='tools/list')await boundary(active);
      if(rpc.method==='tools/call'){
        if(active==='drop-response'){req.socket.destroy();return;}
        if(active==='redirect'){res.writeHead(307,{location:'https://must-never-follow.invalid/mcp'});res.end();return;}
        if(active==='too-large'){res.writeHead(200,{'content-type':'application/json'});res.end(' '.repeat(256*1024+1));return;}
        if(active==='rpc-error'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,error:{code:-32000,message:'Synthetic safe error'}}));return;}
        if(active==='tool-error'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result:{isError:true,content:[{type:'text',text:'Synthetic safe error'}]}}));return;}
      }
      const response=await POST(new Request('https://127.0.0.1/mcp',{method:'POST',headers:req.headers as HeadersInit,body}));
      const payload=await response.text();
      if(rpc.method==='tools/call'&&rpc.params.name==='relay_memory_add'&&response.ok){
        const parsed=JSON.parse(payload);if(parsed.result?.content?.[0]?.text)child.send({type:'memory-created',id:JSON.parse(parsed.result.content[0].text).id});
      }
      if(rpc.method==='tools/call'&&rpc.params.name==='relay_memory_list'&&response.ok){
        const parsed=JSON.parse(payload);if(parsed.result?.content?.[0]?.text){
          const label=req.headers.authorization===`Bearer ${b.credential}`?'b':'a';
          listResultCounts[label]??=[];listResultCounts[label].push(JSON.parse(parsed.result.content[0].text).length);
        }
      }
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(payload);
    }catch{if(!res.headersSent)res.writeHead(500);res.end();}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`https://127.0.0.1:${(server.address() as {port:number}).port}`;
  const done=new Promise<void>((resolve,reject)=>{
    child.on('message',(msg:any)=>{
      if(msg.type==='ready')child.send({origin,a,b});
      if(msg.type==='mode'){mode=msg.name;child.send({type:'mode-ready',id:msg.id});}
      if(msg.type==='result')result=msg;
    });
    child.on('exit',code=>code===0?resolve():reject(new Error(`MyEve fixture child failed (${code}): ${childError}`)));
  });
  try{
    await done;expect(result?.status).toBe('PASS_SCOPED_CANONICAL_MCP');
    expect(cookieObserved).toBe(false);expect(wrongPath).toBe(false);
    for(const name of['rotate','revoke','cancel-run','policy-denied','abort-before-call'])expect(counts[name]?.['tools/call']??0).toBe(0);
    for(const name of['rpc-error','tool-error','redirect','too-large','drop-response'])expect(counts[name]?.['tools/call']).toBe(1);
    expect(counts['hold-initialize']?.initialize).toBe(2);expect(counts['hold-list']?.['tools/list']).toBe(1);
    expect(listResultCounts.b).toEqual([0]);expect(listResultCounts.a).toContain(1);
    const activity=await listActivity(accountId,{agentId:a.agentId});
    expect(activity.some(item=>item.action==='memory.add'&&item.status==='SUCCESS')).toBe(true);
    writeFileSync(process.env.MYEVE_MCP_RESULT!,JSON.stringify({status:result.status,checks:result.checks,
      relaySource:'ccd32878759bd03a8d6775141769498487496958',sdk:'@ai-sdk/mcp@2.0.19',counts,cookieObserved,wrongPath,
      ownerPrivateMemoryIsolation:'PASS',capability:'Synthetic test-only authority; canonical default DENY',
      productionCalls:0,testerTurns:0,paidCalls:0},null,2)+'\n');
  }finally{child.kill();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},60000);
