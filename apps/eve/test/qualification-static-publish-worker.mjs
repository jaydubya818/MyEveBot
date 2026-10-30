/** Worker for the multi-process publish race: publishes one synthetic artifact to a shared root and prints the result. Synthetic only. */
import {createHash} from 'node:crypto';
import {StaticReleaseController} from '../lib/qualification/static-publish.ts';
import {StaticArtifactCandidate} from '../../../packages/myapps/src/static-artifact.ts';
const [root,seed,project]=process.argv.slice(2);
const sha=b=>createHash('sha256').update(b).digest('hex');
const files={'dist/index.html':Buffer.from('<html>worker '+seed+'</html>'),'dist/assets/app.js':Buffer.from('console.log('+seed+')')};
const commit=seed.repeat(40),pins={sourceCommit:commit,sourceTree:commit,lockSha256:'a'.repeat(64)};
const inv={schema:'myeve.dashboard.build-inventory/v1',scope:'BROWSER_BUILD_ONLY',...pins,node:'v24.0.0',files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})),independentVerification:'NOT_ESTABLISHED',signedResult:false,releaseQualified:false};
const art=await StaticArtifactCandidate.retain(inv,pins,async p=>files[p]);
const c=new StaticReleaseController({root,environment:'myeve-qdev-20261029',appId:'app-1',ownerId:'owner-q1',projectSha256:project,installationId:'inst-1',activation:{permit:async()=>true}});
const r=await c.publish(art);
process.stdout.write(JSON.stringify(r));
