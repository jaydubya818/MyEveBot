import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
// Supplemental candidate-specific checks. The complete original composition
// file set is retained in composition.config.ts and always runs separately.
export default defineConfig({
 resolve:{alias:{'@':fileURLToPath(new URL('../../apps/eve/',import.meta.url))}},
 test:{fileParallelism:false,testTimeout:60000,hookTimeout:120000,include:[
  'packages/myapps/qualification/accounting-upgrade.test.ts',
  'apps/eve/lib/external-alpha/qe-002-per-criterion-repro-postgres.test.ts',
  'apps/eve/lib/external-alpha/work-controller-postgres.test.ts',
  'apps/eve/lib/external-alpha/chat-recovery-postgres.test.ts',
  'apps/eve/lib/external-alpha/model-recovery-postgres.test.ts',
  'apps/eve/lib/external-alpha/context.test.ts',
  'apps/eve/lib/external-alpha/conversation-readback.test.ts',
  'apps/eve/lib/relay/connect-concurrency.test.ts'
 ]}
});
