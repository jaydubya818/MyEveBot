import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const output=resolve(process.argv[2]);
const evidence={snapshots:{}};
for(const name of ['myeve','myfactory']) {
  const path=join(output,name);
  const git=(...args)=>execFileSync('git',args,{cwd:path,encoding:'utf8'}).trim();
  assert.equal(git('status','--porcelain'),'','Qualification source must be clean');
  evidence.snapshots[name]={snapshot:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),path};
}
assert.equal(evidence.snapshots.myfactory.snapshot,'87a9a8471848d7c51ea334ae95077bfa4460d45f');
const fileRecord=(name,path)=>({path,sha256:createHash('sha256').update(readFileSync(join(output,name,path))).digest('hex')});
const migrations=(name,path)=>readdirSync(join(output,name,path)).filter(file=>file.endsWith('.sql')).sort().map(file=>fileRecord(name,path+'/'+file));
const envelope={
  format:'myapps.production-authorization-draft.v1',executable:false,authorization:'NOT_GRANTED',readiness:'NOT_READY',
  sources:Object.fromEntries(Object.entries(evidence.snapshots).map(([name,{path,...identity}])=>[name,identity])),
  candidateAdoption:'NOT_AUTHORIZED',
  targets:{myeveProject:null,applicationDatabase:null,factoryInstallation:null,factoryDatabase:null,accountingDatabase:null,witnessDatabase:null,custodyStore:null},
  configuration:{factoryVersion:null,verifierPolicy:null,signerKeyIds:[],databaseRole:null,witnessDatabaseRole:null,MYAPPS_LOCAL_INTEGRATION:'UNSET',productionGate:'DENIED'},
  applicationMigrations:migrations('myeve','apps/eve/migrations'),
  factoryMigrations:migrations('myfactory','apps/cloud-control/migrations'),
  independentWitnessMigration:fileRecord('myfactory','docs/capability-control/receiver-witness.sql'),
  centralAccountingSql:['shared-accounting.sql','shared-accounting-recovery.sql','shared-accounting-zero-gap.sql'].map(file=>fileRecord('myeve','apps/eve/lib/external-alpha/'+file)),
  capabilityControlSql:['migration.sql','enforcement.sql','decisions.sql','ordering.sql','lifecycle.sql'].map(file=>fileRecord('myeve','docs/capability-control/'+file)),
  capabilityBinding:{ownerId:null,organizationId:null,installationId:null,agentId:null,environment:null,policyRevision:null,policyIdentity:null,backendEnrollment:null,backendIncarnation:null,recoveryWitness:null},
  capabilityTopology:{qualification:'NOT_QUALIFIED_FOR_INSTALLATION',nativeAdmissionTransactionRequired:true,crossDatabasePolicy:'SIGNED_VERSIONED_ADMISSION_REFERENCES',receiverRevalidation:'REQUIRED',receiverTables:6,independentRecoveryWitnessRequired:true,witnessNetworkOutsideNativeLocks:true,lockOrder:null,lockOrderReview:'REQUIRED_WITH_FACTORY_ADVISORY_81427603_AND_CANONICAL_ACCOUNTING',historicalBindingBackfill:'FORBIDDEN',witnessReset:'FORBIDDEN'},
  lockfiles:['myeve','myfactory'].map(name=>({repository:name,...fileRecord(name,'package-lock.json')})),
  ordering:[
    'Verify exact approved non-alpha targets, current ledgers/checksums, roles and tested backups; reject missing identity.',
    'Qualify empty-target central accounting base then recovery SQL separately; existing-target upgrade requires an exact baseline and its own approval. Never apply base SQL over existing accounting history.',
    'Reconcile Factory migration ledger in manifest order without installation registration, production grants or source-identity reuse.',
    'Reconcile application migrations through 0109 using the exact hashed applicationMigrations catalog, preserving original published 0099 bytes, the additive immutable Factory terminal and generation guards, and the shipped application-password and chat-only beta migrations. Reject altered 0099 ledgers without rewriting checksums; existing Phase2 0085 MyApps ledgers require a separately reviewed transfer.',
    'Capability qualification SQL is a separate additive source contract, never automatic application startup. Require exact authenticated versioned MyEve and Relay admission references, receiving-backend revalidation with native admission/accounting in one local transaction, original trusted enrollment and an independent recovery witness before any installation claim. No distributed transaction or competing ledger.',
    'Keep all execution disabled; qualify successor FactoryVersion, bootstrap, custody/signers, rollback and owner isolation before separate activation approval.'
  ],
  rollback:'Disable admission, fence in-flight Work, reconcile original UNKNOWN resources, retain data/evidence and restore compatible code. Never drop app tables or refund uncertain spend.',
  blockers:['Full composition and independent security gates must pass','Candidate dependency acceptance','Exact target and ledger identities','Successor FactoryVersion and configuration','Production bootstrap/admission/transport/custody/signers','Backup/restore and operational rollback','Exact capability bindings, signed cross-database policy references, monotonic independent recovery witness and reviewed native lock ordering'],
  permissions:{merge:false,deploy:false,migrate:false,activate:false,paidExecution:false,productionGrants:false,externalAlphaChanges:false}
};
writeFileSync(join(output,'authorization-envelope.json'),JSON.stringify(envelope,null,2)+'\n',{flag:'wx'});
