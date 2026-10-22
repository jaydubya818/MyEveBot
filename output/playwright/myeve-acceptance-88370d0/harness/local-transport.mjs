import pg from '/Users/jaywest/node_modules/pg/lib/index.js';
const pool = new pg.Pool({host:'127.0.0.1',port:55473,user:'jaywest',database:'postgres',max:8});
const originalFetch=globalThis.fetch;
globalThis.fetch=async (input,init)=>{
 const headers=new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
 const connection=headers.get('Neon-Connection-String');
 if(connection){
  const u=new URL(connection);
  if(!['127.0.0.1','localhost'].includes(u.hostname)||u.port!=='55473') throw new Error('Qualification denies non-isolated database');
  const body=JSON.parse(init.body);const client=await pool.connect();
  try{
   if(body.queries)await client.query('BEGIN');
   const results=[];
   for(const q of body.queries??[body]){
    const r=await client.query({text:q.query,values:q.params,rowMode:'array',types:{getTypeParser:()=>x=>x}});
    results.push({fields:r.fields,rows:r.rows,command:r.command,rowCount:r.rowCount});
   }
   if(body.queries)await client.query('COMMIT');
   return Response.json(body.queries?{results}:results[0]);
  }catch(e){if(body.queries)await client.query('ROLLBACK');return Response.json({message:e.message,code:e.code},{status:400});}
  finally{client.release();}
 }
 const u=new URL(typeof input==='string'?input:input.url??input);
 if(!['localhost','127.0.0.1','::1'].includes(u.hostname))throw new Error('Qualification external network blocked: '+u.hostname);
 return originalFetch(input,init);
};
