/** TEST-ONLY Relay contract with invented tool names, used to keep exercising the grant's write/deploy/workflow/admin denials.
 * Frozen Relay /mcp exposes none of these tools; production uses CANONICAL_RELAY_CONTRACT. */
import {z} from 'zod';
import {QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
const none=kind=>({kind,input:z.object({}).strict(),sample:{},action:g=>({kind,repository:g.repository}),native:(g,a)=>({...a,repository:g.repository})});
export const testContract={
  read_file:{kind:'read_contents',input:z.object({ref:z.string().optional(),repository:z.string().optional()}).strict(),sample:{},
    action:(g,a)=>({kind:'read_contents',repository:a.repository??g.repository,ref:a.ref}),native:(g,a)=>({...a,repository:g.repository})},
  write_file:{kind:'write_contents',input:z.object({branch:z.string(),baseCommit:z.string().optional(),path:z.string(),force:z.boolean().optional(),repository:z.string().optional()}).strict(),
    sample:{branch:QDEV_BASELINE.outputBranch,path:'src/sample.ts'},
    action:(g,a)=>({kind:'write_contents',repository:a.repository??g.repository,branch:a.branch,baseCommit:a.baseCommit??g.baseCommit,force:a.force,path:a.path}),
    native:(g,a)=>({...a,repository:g.repository,baseCommit:a.baseCommit??g.baseCommit,force:a.force??false})},
  deploy:none('write_deployment'),edit_ci:none('edit_workflow'),admin:none('administer_repository'),
};
