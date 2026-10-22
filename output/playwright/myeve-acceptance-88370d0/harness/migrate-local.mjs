import pg from '/Users/jaywest/node_modules/pg/lib/index.js';
import {readFile,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
const client=new pg.Client({host:'127.0.0.1',port:55473,user:'jaywest',database:'postgres'});await client.connect();
await client.query('CREATE TABLE sofie_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
const dir='/tmp/myeve-acceptance-88370d0/apps/eve/migrations';
for(const name of (await readdir(dir)).filter(x=>/^00(0[1-9]|[12][0-9]|30)_.*sql$/.test(x)).sort()){
 const source=await readFile(dir+'/'+name,'utf8');await client.query('BEGIN');
 try{for(const s of source.split(/^\s*-- statement-breakpoint\s*$/m).filter(s=>s.trim()))await client.query(s);
 await client.query('INSERT INTO sofie_schema_migrations(name,checksum) VALUES($1,$2)',[name,createHash('sha256').update(source).digest('hex')]);await client.query('COMMIT');console.log(name);}catch(e){await client.query('ROLLBACK');throw e;}
}await client.end();
