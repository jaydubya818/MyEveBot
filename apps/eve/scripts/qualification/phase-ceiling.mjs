// node scripts/qualification/phase-ceiling.mjs <phase-name> <allowance-microusd>
// Adds a stricter phase ceiling to the EXISTING campaign ledger: prior liability
// (spent + uncertain reservations) plus the phase allowance. It never changes
// balances, never resets the $5 allowance and never replaces an existing ceiling.
// Requires the exclusive campaign lock and a verified backup taken beforehand.
import {Pool} from 'pg';
import {access,appendFile} from 'node:fs/promises';
import path from 'node:path';
const [phase,allowanceText]=process.argv.slice(2);
if(!/^[a-z0-9-]{3,40}$/.test(phase??'')||!/^\d{1,7}$/.test(allowanceText??''))throw new Error('Usage: phase-ceiling.mjs <phase-name> <allowance-microusd>');
const allowance=Number(allowanceText);
if(allowance<=0||allowance>1000000)throw new Error('Phase allowance must be positive and at most $1.');
const campaign=process.env.MYEVE_QUALIFICATION_CAMPAIGN_DIR??path.join(process.env.HOME,'Library/Application Support/RelayQualification/telegram-private-beta');
await access(path.join(campaign,'campaign.lock','owner.json'));
const pool=new Pool({host:'127.0.0.1',port:55447,user:process.env.USER,database:'owner_qualification',max:1});
const client=await pool.connect();
try{
 if((await client.query('SHOW data_directory')).rows[0].data_directory!==path.join(campaign,'postgres'))throw new Error('Not the active campaign ledger.');
 await client.query('BEGIN');
 await client.query('LOCK TABLE owner_qualification_budget IN ACCESS EXCLUSIVE MODE');
 const existing=await client.query("SELECT conname FROM pg_constraint WHERE conrelid='owner_qualification_budget'::regclass AND conname='owner_qualification_phase_ceiling'");
 if(existing.rowCount)throw new Error('A phase ceiling already exists; review it instead of replacing it.');
 const snapshot=async()=>{
  const [b]=(await client.query('SELECT reserved_microusd::bigint r,spent_microusd::bigint s FROM owner_qualification_budget')).rows;
  const calls=(await client.query("SELECT count(*)::int n,COALESCE(sum(reserved_microusd),0)::bigint reserved,COALESCE(sum(spent_microusd),0)::bigint spent,count(*) FILTER (WHERE status<>'completed')::int uncertain FROM owner_model_calls")).rows[0];
  return {reserved:Number(b.r),spent:Number(b.s),liability:Number(b.r)+Number(b.s),calls:calls.n,uncertainCalls:calls.uncertain};
 };
 const before=await snapshot();
 const ceiling=before.liability+allowance;
 if(ceiling>5000000)throw new Error('Phase ceiling would exceed the original $5 allowance.');
 await client.query(`ALTER TABLE owner_qualification_budget ADD CONSTRAINT owner_qualification_phase_ceiling CHECK(reserved_microusd+spent_microusd<=${ceiling})`);
 const after=await snapshot();
 if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Ledger changed while adding the ceiling.');
 await client.query('COMMIT');
 const evidence={at:new Date().toISOString(),phase,allowanceMicroUsd:allowance,ceilingMicroUsd:ceiling,before,after,conserved:true,originalAllowanceRemainingMicroUsd:5000000-after.liability,phaseRemainingMicroUsd:ceiling-after.liability};
 await appendFile(path.join(campaign,'phase-ceilings.jsonl'),JSON.stringify(evidence)+'\n',{mode:0o600});
 console.log(JSON.stringify(evidence));
}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
finally{client.release();await pool.end();}
