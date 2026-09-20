import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {verifiedSource} from './worker-entrypoint.mjs';
// node .../package-worker.mjs /absolute/app/checkout /new/output/directory SHA
// Source-only export. No credentials, deployment, package installation or session.
const [sourceArg,destinationArg,sha]=process.argv.slice(2);
if(!sourceArg||!destinationArg)throw Error('SOURCE_AND_NEW_DESTINATION_REQUIRED');
const source=resolve(sourceArg),destination=resolve(destinationArg);
verifiedSource(source,sha);
mkdirSync(destination,{recursive:false});
const archive=join(destination,'source.tar');
try{
 execFileSync('git',['archive','--format=tar',`--output=${archive}`,sha],{cwd:source});
 execFileSync('tar',['-xf',archive,'-C',destination]);
}finally{rmSync(archive,{force:true});}
const controls=fileURLToPath(new URL('.',import.meta.url));
const readiness=resolve(controls,'../../..');
const controlsSha=execFileSync('git',['rev-parse','HEAD'],{cwd:readiness,encoding:'utf8'}).trim();
verifiedSource(readiness,controlsSha);
const runtime=['worker-entrypoint.mjs','worker.mjs','runtime.mjs','server.mjs','controller.mjs','postgres.mjs','model.mjs'];
mkdirSync(join(destination,'qualification-runtime'));
for(const file of runtime)copyFileSync(join(controls,file),join(destination,'qualification-runtime',file));
writeFileSync(join(destination,'qualification-runtime','source.json'),JSON.stringify({readiness:controlsSha}));
const tracked=execFileSync('git',['ls-files','-z'],{cwd:source,encoding:'utf8'}).split('\0').filter(Boolean);
const paths=[...tracked,...runtime.map(file=>`qualification-runtime/${file}`),'qualification-runtime/source.json'];
const files=Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(join(destination,path))).digest('hex')]));
writeFileSync(join(destination,'.fq-source.json'),JSON.stringify({sha,controlsSha,files}));
console.log(JSON.stringify({sourceSha:sha,controlsSha,fileCount:paths.length,deploys:false}));
