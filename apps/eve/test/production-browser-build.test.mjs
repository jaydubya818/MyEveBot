import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProductionBrowser} from './browser/production-browser-build.mjs';

test('production fixture records actual build identity and fails closed on either build failure',async()=>{
  const root=await mkdtemp(join(tmpdir(),'production-browser-build-'));
  try {
    const eve=join(root,'eve'),next=join(root,'next.cjs'),app=join(root,'app');
    await mkdir(join(eve,'bin'),{recursive:true});await mkdir(app);
    await writeFile(join(eve,'bin/eve.js'),`if(process.argv[2]!=='build'||process.env.NODE_ENV!=='production'||process.env.CI!=='1')process.exit(90);process.exit(Number(process.env.EVE_EXIT??0));`);
    await writeFile(next,`if(process.argv.slice(2).join(' ')!=='build --webpack')process.exit(90);if(process.env.NEXT_EXIT)process.exit(Number(process.env.NEXT_EXIT));require('fs').mkdirSync('.next',{recursive:true});require('fs').writeFileSync('.next/BUILD_ID','actual-fixture-build');require('fs').writeFileSync('.next/build-manifest.json','{}');`);
    const require={resolve:name=>name==='eve/package.json'?join(eve,'package.json'):next};
    for(const failure of [null,'EVE_EXIT','NEXT_EXIT']) {
      const output=join(root,failure??'passed');await mkdir(output);
      const run=()=>buildProductionBrowser({app,output,require,env:failure?{[failure]:'7'}:{}});
      if(failure)await assert.rejects(run,/build must succeed/);
      else {
        const report=await run();
        assert.deepEqual(report,{mode:'PRODUCTION_BUILD',stages:['deterministic-agent','next-production'],nextBuildId:'actual-fixture-build',nextBuildManifestSha256:createHash('sha256').update('{}').digest('hex')});
        assert.deepEqual(JSON.parse(await readFile(join(output,'build-report.json'),'utf8')),report);
      }
      const log=await readFile(join(output,'build.log'),'utf8');assert.ok(log.includes('BUILD deterministic-agent'));
      assert.equal(log.includes('BUILD next-production'),failure!=='EVE_EXIT');
    }
  } finally {await rm(root,{recursive:true,force:true});}
});
