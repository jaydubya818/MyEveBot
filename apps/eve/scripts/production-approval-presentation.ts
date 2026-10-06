import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from '../lib/engineering/contract.ts';
import {assertProductionApproval} from '../lib/engineering/production-approval.ts';

/** Validate the exact approval string before presenting it; never trim or repair it. */
export function productionApprovalPresentation(envelope: unknown, approvedDigest: string, now=Date.now()) {
 if(typeof approvedDigest!=='string'||!/^[a-f0-9]{64}$/.test(approvedDigest))throw Error('AUTHORIZATION_SHA256_FORMAT');
 assertProductionApproval(envelope,approvedDigest,now);
 return {canonicalEnvelopeDigest:approvedDigest,digestLength:64,status:'READY_FOR_AUTHORIZATION' as const};
}
async function main(){
 const [path,supplied,...extra]=process.argv.slice(2);
 if(!path||extra.length)throw Error('USAGE: production-approval-presentation <envelope.json> [exact-digest]');
 const envelope=JSON.parse(await readFile(path,'utf8'));
 console.log(JSON.stringify(productionApprovalPresentation(envelope,supplied??digest(envelope))));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('AUTHORIZATION_PRESENTATION_REJECTED: no authority created.');process.exitCode=1;});
