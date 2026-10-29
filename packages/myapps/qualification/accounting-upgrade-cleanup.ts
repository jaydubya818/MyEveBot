import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

type Pool={end():Promise<void>};
type Admin=Pool&{query(sql:string,params?:unknown[]):Promise<{rows:unknown[]}>};

/** Only the exact random database created by the accounting upgrade fixture. */
export async function cleanupAccountingUpgrade({pool,admin,name,created,primaryFailure}:{
 pool?:Pool;admin:Admin;name:string;created:boolean;primaryFailure?:{error:unknown};
}){
 const failures:unknown[]=[];
 try{
  if(pool)await pool.end();
  if(created){
   assert.match(name,/^myapps_accounting_upgrade_[a-f0-9]{32}$/,'Unexpected fixture database');
   let remaining:unknown[]=[];
   for(let attempt=0;attempt<100;attempt++){
    remaining=(await admin.query('SELECT pid FROM pg_stat_activity WHERE datname=$1',[name])).rows;
    if(remaining.length===0)break;
    if(attempt<99)await delay(20);
   }
   assert.equal(remaining.length,0,'Owned accounting fixture is not quiescent; database retained');
   await admin.query('DROP DATABASE '+name);
  }
 }catch(error){failures.push(error);}
 // Closing the admin is independent of pool shutdown, observation or DROP success.
 try{await admin.end();}catch(error){failures.push(error);}
 if(primaryFailure){
  if(failures.length)throw new AggregateError([primaryFailure.error,...failures],
   'Accounting upgrade failed and owned cleanup failed; database may be retained');
  throw primaryFailure.error;
 }
 if(failures.length===1)throw failures[0];
 if(failures.length)throw new AggregateError(failures,'Owned accounting fixture cleanup failed');
}
