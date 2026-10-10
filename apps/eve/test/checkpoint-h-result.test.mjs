import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('required Result runtime absence retains NOT_RUN evidence and fails the hosted gate',async()=>{
  const root=await mkdtemp(join(tmpdir(),'checkpoint-result-missing-runtime-'));
  try {
    const script=fileURLToPath(new URL('./checkpoint-h-result.mjs',import.meta.url));
    const source=await readFile(script,'utf8');
    const expected=source.match(/assert\.equal\(sha\(mc\),'([a-f0-9]{40})'\)/)?.[1];assert.ok(expected);
    const mc=join(root,'mc'),output=join(root,'output'),preload=join(root,'source-identity-fixture.mjs');await mkdir(mc);
    // Only source metadata is stubbed. No runtime, backend, transport, or proof exists in this prerequisite test.
    await writeFile(preload,`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
cp.execFileSync=(command,args)=>{if(command==='git'&&JSON.stringify(args)===JSON.stringify(['status','--porcelain']))return '';if(command!=='git'||JSON.stringify(args)!==JSON.stringify(['rev-parse','HEAD']))throw Error('Unexpected command in missing-runtime test');return ${JSON.stringify(expected+'\n')};};syncBuiltinESMExports();`);
    const env={...process.env,MISSIONCONTROL_SOURCE_ROOT:mc};delete env.MC_GOLDEN_RUNTIME_BUILD;
    for(const [runner,destination,args] of [[script,output,[]],[fileURLToPath(new URL('./checkpoint-h-result-security.mjs',import.meta.url)),join(root,'security-output'),[expected]]]) {
      const result=spawnSync(process.execPath,['--import',preload,runner,destination,...args],{cwd:resolve(root),env,encoding:'utf8'});
      assert.equal(result.status,1,result.stderr);
      const report=JSON.parse(await readFile(join(destination,'report.json'),'utf8'));
      assert.equal(report.status,'NOT_RUN');assert.equal(report.fullJourney??report.fullOwnerJourney,'NOT_RUN');assert.equal(report.paidOperations,0);
      assert.match(report.reason,/Exact locked native runtime/);
      assert.equal(report.browser,undefined);assert.equal(report.nativeControls,undefined);assert.equal(report.consumer,undefined);
    }
  } finally {await rm(root,{recursive:true,force:true});}
});
