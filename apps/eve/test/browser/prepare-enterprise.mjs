import {execFileSync} from 'node:child_process';
import {copyFile,mkdir,symlink,writeFile,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]),target=resolve(process.argv[3]);
execFileSync('git',['clone','--no-hardlinks',source,target],{stdio:'pipe'});
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:source,encoding:'utf8'}).split('\0').filter(Boolean),hashes={};
for(const file of files){await mkdir(dirname(join(target,file)),{recursive:true});await copyFile(join(source,file),join(target,file));hashes[file]=createHash('sha256').update(await readFile(join(source,file))).digest('hex');}
await symlink(join(source,'node_modules'),join(target,'node_modules'));await symlink(join(source,'apps/eve/node_modules'),join(target,'apps/eve/node_modules'));
await copyFile(join(source,'apps/eve/test/browser/enterprise-model.fixture.ts'),join(target,'apps/eve/agent/agent.ts'));
const transport=join(target,'apps/eve/test/browser/local-transport.cjs');await writeFile(transport,(await readFile(transport,'utf8')).replace("configured.pathname !== '/blocker_fixes'","configured.pathname !== '/postgres'"));
await writeFile(join(target,'CHECKPOINT_H_FIXTURE.json'),JSON.stringify({sha:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),hashes,overlays:['Deterministic model','Loopback PostgreSQL transport'],paidOperations:0},null,2)+'\n');
