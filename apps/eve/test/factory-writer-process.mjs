import {Pool} from 'pg';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {WorkStore} from '../lib/engineering/store.ts';
import {FactoryWriterStore} from '../lib/engineering/factory-writer.ts';
import {FactoryReceiptStore} from '../lib/engineering/factory-receipt-store.ts';
import {RouteAdmissionService} from '../lib/engineering/route-admission.ts';
import {admitFactoryResult} from '../lib/engineering/factory-result-consumer.ts';
import {DirectDevelopmentStore} from '../lib/engineering/direct-development.ts';
import {DirectVerificationDriver} from '../lib/engineering/direct-verification-driver.ts';
process.once('message',async m=>{
 const u=new URL(m.url);if(u.hostname!=='127.0.0.1'||u.port!=='55479'||!/^\/gateb_[a-f0-9]+$/.test(u.pathname))throw new Error('Gate B disposable database only');
 const pool=new Pool({connectionString:m.url});const db={query:async(s,p)=>(await pool.query(s,p)).rows};const work=new WorkStore(m.principal,db),writers=new FactoryWriterStore(work);
 const checkpoint=async()=>{process.send({ready:true});await new Promise(()=>{});};
 if(m.stage==='NATIVE_FENCED'){await writers.fenceNative(m.run);await checkpoint();}
 if(m.stage==='FACTORY_ACQUIRED'){await new RouteAdmissionService(work,{read:async()=>m.authority}).admit(m.workId,m.admission);await checkpoint();}
 if(m.stage==='DISPATCH_RECORDED'){await writers.dispatch(m.run,{dispatch:async identity=>{if(!m.producerDir.startsWith('/private/var/')&&!m.producerDir.startsWith('/var/')&&!m.producerDir.startsWith('/tmp/')&&!m.producerDir.startsWith('/private/tmp/'))throw Error('Fixture directory');await writeFile(join(m.producerDir,identity.dispatchIdentity+'.json'),JSON.stringify({identity,state:'RUNNING'}),{flag:'wx'});await checkpoint();},stop:async()=>{},observe:async()=>null});}
 if(m.stage==='RECEIVED'||m.stage==='ADMITTED')await admitFactoryResult(new FactoryReceiptStore(m.principal,db),m.requestId,m.result,{keys:async()=>m.keys,afterStage:async stage=>{if(stage===m.stage)await checkpoint();}});
 if(m.stage==='FACTORY_FENCED'){await writers.reconcile(m.run,{observe:async()=>m.observation,dispatch:async()=>{},stop:async()=>{}});await checkpoint();}
 if(m.stage==='CUSTODY'){await writers.takeCustody(m.run,m.receiptId,m.source,m.profile,{keys:async()=>m.keys});await checkpoint();}
 if(m.stage==='VERIFICATION_STARTED'){const direct=new DirectDevelopmentStore(work,m.directConfig);await new DirectVerificationDriver(direct,{verify:async()=>{await checkpoint();throw Error('killed before verifier output');}},2).run(m.workId);}
 throw Error('Checkpoint not reached');
});
