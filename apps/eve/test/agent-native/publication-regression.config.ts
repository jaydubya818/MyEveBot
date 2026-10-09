import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'../publication',testMatch:'owner.spec.ts',reporter:[['list'],['json',{outputFile:'../../../../docs/verification/agent-native-work/browser-publication-final.json'}]],outputDir:'../../../../output/playwright/agent-native/publication-artifacts'});
