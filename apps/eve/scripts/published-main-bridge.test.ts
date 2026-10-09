import {describe,it,expect} from 'vitest';
import published from './published-main-d64f2f9.json';
import deployed from './deployed-main-7c1e107.json';
import {publishedMainState} from './published-main-bridge.ts';
import {loadMigrations,type MigrationDatabase} from './migration-runner.ts';
const migrations=await loadMigrations();
const ledger=(m:Record<string,string>)=>Object.entries(m).map(([name,checksum])=>({name,checksum}));
const db=(schema:unknown=published.schema):MigrationDatabase=>({query:async sql=>sql.includes('to_regclass')?[{present:null}]:[{value:schema}],transaction:async()=>{throw Error('Read-only preflight must not mutate');}});
describe('exact published migration recognition',()=>{
 it('still recognizes the pinned published canonical prefix',async()=>{expect((await publishedMainState(db(),migrations,ledger(published.migrations)))?.sourceCommit).toBe(published.source);});
 it('recognizes the deployed reconciled feature prefix without rewriting the ledger',async()=>{const rows=ledger(deployed.migrations),original=JSON.stringify(rows);const result=await publishedMainState(db(),migrations,rows);expect(result?.sourceCommit).toBe(deployed.source);expect(JSON.stringify(rows)).toBe(original);expect(result?.satisfied['0040_app_settings.sql'].source).toBe('0039_relay_message_reply_settings.sql');});
 it('rejects partial, modified and mixed deployed histories',async()=>{
  const rows=ledger(deployed.migrations);
  for(const bad of [rows.slice(1),rows.map((r,i)=>i?r:{...r,checksum:'bad'}),[...rows,{name:'0039_app_settings.sql',checksum:published.migrations['0039_app_settings.sql']}],rows.map(r=>r.name==='0017_owner_file_inventory.sql'?{...r,checksum:published.migrations[r.name]}:r)])
   await expect(publishedMainState(db(),migrations,bad)).rejects.toThrow();
 });
 it('rejects schema drift including column nullability',async()=>{const schema=structuredClone(published.schema);schema[0].columns[0].notNull=false;await expect(publishedMainState(db(schema),migrations,ledger(deployed.migrations))).rejects.toThrow('schema equivalence');});
});
