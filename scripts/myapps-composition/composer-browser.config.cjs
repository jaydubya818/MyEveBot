const {defineConfig}=require('@playwright/test');
const path=require('node:path');

module.exports=defineConfig({
  testDir:path.resolve(__dirname,'../../apps/eve/test/owner-ux'),
  testMatch:'composer-refresh.spec.cjs',workers:1,timeout:120000,
  expect:{timeout:20000},reporter:[['list']],
  outputDir:path.join(process.env.QE_EVIDENCE_DIR??'/tmp/myapps-composer-browser','focused-results'),
  use:{baseURL:'http://localhost:3183',channel:'chromium',headless:true,
    actionTimeout:60000,navigationTimeout:90000,trace:'on',screenshot:'only-on-failure'},
});
