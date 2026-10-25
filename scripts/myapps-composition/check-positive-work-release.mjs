/** Required CI precondition. Builtins + pure QA module only. Never imports or
 * starts application/SDK/provider/database code and always exits nonzero. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {archivePath,archivedWorkFiles,releaseGuardFiles,evaluatePositiveWorkPrecondition,
 observationUnavailable,parsePreconditionArguments} from './positive-work-release-precondition.mjs';

let result=observationUnavailable();
try{
 const args=parsePreconditionArguments(process.argv.slice(2));
 if(!args)throw Error('INVALID_ARGUMENTS');
 const root=realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
 const read=(path,limit)=>{
  const absolute=join(root,path),meta=lstatSync(absolute);
  if(!meta.isFile()||meta.isSymbolicLink()||meta.size>limit||realpathSync(absolute)!==absolute)throw Error('OWNED_SOURCE_REQUIRED');
  const body=readFileSync(absolute);if(body.length!==meta.size)throw Error('OWNED_SOURCE_CHANGED');return body;
 };
 const hash=body=>createHash('sha256').update(body).digest('hex');
 const archive=read(archivePath,65536);
 const manifest=JSON.parse(archive);
 const hashFiles=files=>Object.fromEntries(Object.keys(files).map(path=>[path,hash(read(path,256*1024))]));
 const environment={PATH:'/usr/bin:/bin',HOME:'/nonexistent',LC_ALL:'C',
  GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_OPTIONAL_LOCKS:'0',
  GIT_TERMINAL_PROMPT:'0',GIT_NO_REPLACE_OBJECTS:'1'};
 const git=(...parameters)=>execFileSync('/usr/bin/git',parameters,{cwd:root,env:environment,
  timeout:10000,maxBuffer:65536,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const identity=git('rev-parse','HEAD','HEAD^{tree}').trim().split('\n');
 if(identity.length!==2)throw Error('SOURCE_IDENTITY_REQUIRED');
 result=evaluatePositiveWorkPrecondition({...args,checkoutSource:identity[0],checkoutTree:identity[1],
  sourceClean:git('status','--porcelain=v1','--untracked-files=all')==='',releaseMode:manifest.releaseMode,
  observedArchiveSha256:hash(archive),workFileHashes:hashFiles(archivedWorkFiles),guardFileHashes:hashFiles(releaseGuardFiles)});
}catch{/* Fixed public metadata only; no args, paths, errors, environment or payload. */}
process.stdout.write(JSON.stringify(result)+'\n');
process.exitCode=1;
