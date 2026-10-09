// Compare protocol fixtures, not repository SHAs. Run before integration in CI.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const local=readFileSync(new URL('../../apps/eve/lib/relay/fixtures/canonical-relay-v2.json',import.meta.url));
let upstream;
if(process.env.RELAY_CONTRACT_FILE) upstream=readFileSync(process.env.RELAY_CONTRACT_FILE);
else {
 const response=await fetch('https://raw.githubusercontent.com/jaydubya818/relay/main/docs/federation/vectors/signing-envelope-v2.json',{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error(`Canonical contract retrieval failed: ${response.status}`);
 upstream=Buffer.from(await response.arrayBuffer());
}
if(!local.equals(upstream))throw Error('Canonical Relay contract fixture changed: regenerate the copy and requalify MyEve before integration.');
console.log(JSON.stringify({contract:'relay-federation-v2',sha256:createHash('sha256').update(local).digest('hex'),status:'PASS'}));
