// Canonical unpaid Golden Journey, including in-progress chat and natural follow-ups.
const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:__dirname,testMatch:'journey.spec.cjs',workers:1,timeout:1200000,expect:{timeout:120000},reporter:[['list']],outputDir:(process.env.QE_EVIDENCE_DIR??'./output/qe-journey')+'/E1-results',use:{baseURL:'http://localhost:3183',channel:'chromium',headless:true,actionTimeout:180000,navigationTimeout:240000,trace:'on',screenshot:'only-on-failure'}});
