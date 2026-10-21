import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 resolve:{alias:{'@':fileURLToPath(new URL('../../apps/eve/',import.meta.url))}},
 test:{fileParallelism:false,testTimeout:30000,hookTimeout:120000,include:[
  'packages/myapps/integration/*.test.ts',
  'apps/eve/lib/database-schema.test.ts',
  'apps/eve/lib/external-alpha/features.test.ts',
  'apps/eve/lib/external-alpha/proxy.test.ts',
  'apps/eve/lib/external-alpha/paid-paths.test.ts',
  'apps/eve/lib/external-alpha/policy.test.ts',
  'apps/eve/lib/external-alpha/allowance-postgres.test.ts',
  'apps/eve/lib/external-alpha/accounting-postgres.test.ts',
  'apps/eve/lib/external-alpha/shared-accounting-postgres.test.ts',
  'apps/eve/lib/external-alpha/work-authority-postgres.test.ts',
  'apps/eve/lib/external-alpha/result-ingestion-postgres.test.ts',
  'apps/eve/lib/external-alpha/private-acceptance-postgres.test.ts'
 ]}
});
