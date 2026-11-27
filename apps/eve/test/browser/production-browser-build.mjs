import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {open,readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {stopOwnedProcess} from './production-browser-runtime.mjs';

/** Build only the isolated deterministic source copy. No deployment or provider credentials. */
export async function buildProductionBrowser({app,output,require,env}) {
  const sdkRoot=dirname(require.resolve('eve/package.json'));
  const packaging=JSON.parse(await readFile(new URL('../../../../patches/eve-node-esm-compat.json',import.meta.url),'utf8'));
  const sdk=JSON.parse(await readFile(join(sdkRoot,'package.json'),'utf8'));
  const packagingSha256=createHash('sha256').update(await readFile(join(sdkRoot,packaging.files[0].path))).digest('hex');
  assert.equal(sdk.version,packaging.version,'Production qualification requires the reviewed SDK version');
  assert.equal(packagingSha256,packaging.patchedSha256,'Apply the reviewed packaging patch before building');
  const log=await open(join(output,'build.log'),'wx'),stages=[];
  try {
    for(const [name,args] of [
      ['deterministic-agent',[join(dirname(require.resolve('eve/package.json')),'bin/eve.js'),'build']],
      ['next-production',[require.resolve('next/dist/bin/next'),'build','--webpack']],
    ]) {
      await log.write(`BUILD ${name}\n`);
      const code=await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,args,{cwd:app,env:{...env,CI:'1',NODE_ENV:'production'},stdio:['ignore',log.fd,log.fd],timeout:600000});
        const cleanup=()=>{process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);process.off('exit',exiting);};
        const interrupted=signal=>{void stopOwnedProcess(child).finally(()=>{cleanup();process.kill(process.pid,signal);});};
        const interrupt=()=>interrupted('SIGINT'),terminate=()=>interrupted('SIGTERM'),exiting=()=>child.kill('SIGTERM');
        process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);process.once('exit',exiting);
        child.once('error',error=>{cleanup();reject(error);});child.once('exit',(code,signal)=>{cleanup();resolve(signal?null:code);});
      });
      assert.equal(code,0,`Isolated ${name} build must succeed; see retained build.log`);
      stages.push(name);
    }
    const nextBuildId=(await readFile(join(app,'.next/BUILD_ID'),'utf8')).trim();
    assert.ok(nextBuildId,'Production browser must retain its actual Next.js build identity');
    const nextBuildManifestSha256=createHash('sha256').update(await readFile(join(app,'.next/build-manifest.json'))).digest('hex');
    const report={mode:'PRODUCTION_BUILD',stages,nextBuildId,nextBuildManifestSha256,sdkVersion:sdk.version,packagingSha256,packagingSource:packaging.source};
    await writeFile(join(output,'build-report.json'),JSON.stringify(report,null,2)+'\n');
    return report;
  } finally {await log.close();}
}
