// Local qualification transport only: canonical Neon queries execute on real
// isolated PostgreSQL. Provider requests are never mocked or fabricated.
import {Pool} from 'pg';
import {appendFileSync} from 'node:fs';
const pool=new Pool({host:'127.0.0.1',port:55447,user:process.env.USER,database:'owner_qualification'});
const originalFetch=globalThis.fetch;
const audit=entry=>appendFileSync('/private/tmp/myeve-owner-transport.jsonl',JSON.stringify({at:new Date().toISOString(),...entry})+'\n');
audit({kind:'bootstrap',pid:process.pid,port:process.env.PORT,host:process.env.HOSTNAME});
globalThis.fetch=async(input,options)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(['qualification.invalid','api.invalid'].includes(url.hostname)){
  const body=JSON.parse(options.body),client=await pool.connect();
  const execute=async statement=>{
   const result=await client.query({text:statement.query,values:statement.params,rowMode:'array',types:{getTypeParser:()=>value=>value}});
   return {command:result.command,rowCount:result.rowCount,rows:result.rows,fields:result.fields};
  };
  try{
   if(body.queries){await client.query('BEGIN');const results=[];for(const statement of body.queries)results.push(await execute(statement));await client.query('COMMIT');return Response.json({results});}
   return Response.json(await execute(body));
  }catch(error){await client.query('ROLLBACK');audit({kind:'database-error',code:error.code,message:error.message});return Response.json({message:error.message,code:error.code},{status:400});}
  finally{client.release();}
 }
 if(url.hostname==='ai-gateway.vercel.sh'&&options?.method==='POST'){
  const body=String(options.body??'');
  const {rows}=await pool.query("SELECT c.*,w.usage_unknown FROM owner_model_calls c JOIN owner_channel_requests w USING(owner_id,run_id) WHERE c.status='inflight' AND c.owner_id='qualification-owner'");
  const {rows:agents}=await pool.query("SELECT instructions FROM agents WHERE id='qualification-agent'");
  if(rows.length!==1||rows[0].usage_unknown||body.includes(agents[0].instructions)){
   audit({kind:'provider-denied',reason:'reservation-or-context'});throw new Error('Qualification provider admission denied');
  }
  audit({kind:'provider-start',model:rows[0].model_id,runId:rows[0].run_id,stepKey:rows[0].step_key,reservationMicrousd:rows[0].reserved_microusd,reservedTokens:rows[0].reserved_tokens,privateCanaryPresent:false});
  const response=await originalFetch(input,options);
  audit({kind:'provider-response',status:response.status});
  return response;
 }
 const response=await originalFetch(input,options);
 if(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.includes('/eve/'))audit({kind:'runtime-http',path:url.pathname,method:options?.method??'GET',status:response.status});
 return response;
};
