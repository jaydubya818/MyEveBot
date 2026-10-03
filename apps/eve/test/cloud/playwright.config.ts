import path from 'node:path';
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.spec.ts',workers:1,retries:0,timeout:420000,expect:{timeout:20000},reporter:[['list'],['json',{outputFile:path.resolve(import.meta.dirname,'../../../../output/playwright/cloud/report.json')}]],outputDir:path.resolve(import.meta.dirname,'../../../../output/playwright/cloud/artifacts'),use:{baseURL:'http://127.0.0.1:3097',channel:'chrome',headless:true,actionTimeout:20000,navigationTimeout:45000,trace:'off',screenshot:'off'}});
