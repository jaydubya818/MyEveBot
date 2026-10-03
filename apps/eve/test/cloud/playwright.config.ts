import path from 'node:path';
import {defineConfig} from '@playwright/test';
const artifacts=process.env.MYEVE_CLOUD_ARTIFACT_DIR==='output/playwright/consolidation-cloud'?'consolidation-cloud':'cloud';
export default defineConfig({testDir:'.',testMatch:'*.spec.ts',workers:1,retries:0,timeout:420000,expect:{timeout:20000},reporter:[['list'],['json',{outputFile:path.resolve(import.meta.dirname,`../../../../output/playwright/${artifacts}/report.json`)}]],outputDir:path.resolve(import.meta.dirname,`../../../../output/playwright/${artifacts}/artifacts`),use:{baseURL:'http://127.0.0.1:3097',channel:'chrome',headless:true,actionTimeout:20000,navigationTimeout:45000,trace:'off',screenshot:'off'}});
