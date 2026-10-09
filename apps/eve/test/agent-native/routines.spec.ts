import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
import {test,expect} from '@playwright/test';
const routine={id:77,routine_name:'Availability watch',prompt:'Check the public listing and report availability.',cron:'0 9 * * *',timezone:'America/Los_Angeles',status:'active',configuration_version:1,reviewed_version:null,next_fire_at:'2026-10-03T16:00:00Z',execution_status:null,consecutive_failures:0,last_failure:null};
const data={executionReady:false,routines:[routine],agents:[{id:'fixture-watcher',name:'Personal Shopper',status:'active',limits:{maxSteps:20,maxRuntimeSeconds:300,maxEstimatedCostUsd:1}}],capabilities:[{id:'tool.record_observation',name:'Record observation',risk:'medium'}]};
test.beforeEach(async({context,page})=>{
 await context.request.post('/api/auth/login',{data:{password:'owner-publication-fixture-only'}});const state=await context.storageState();await context.addCookies(state.cookies.map(c=>({...c,secure:false})));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/api/auth/'))return route.continue();return route.fulfill({json:path==='/api/routines'?data:path==='/api/threads'?{threads:[]}:path==='/api/models'?{models:[]}:path==='/api/commands'?{commands:[]}: {}});});
});
test('owner reviews condition and notification with execution gate visible',async({page},info)=>{
 let submitted:any;
 await page.route('**/api/routines',route=>{if(route.request().method()==='POST'){submitted=route.request().postDataJSON();return route.fulfill({json:{routine:{id:'fixture-routine'}}});}return route.fulfill({json:data});});
 await page.goto('/manage/routines');const section=page.getByRole('region',{name:'Routines'});
 await expect(section.getByText('No Routine will run yet.',{exact:false})).toBeVisible();await expect(section.getByRole('button',{name:'Run Now'})).toBeDisabled();
 await section.getByRole('button',{name:'Review',exact:true}).click();const form=page.getByRole('form',{name:'Review Availability watch'});
 await form.getByLabel('Condition (optional)').fill('The item is in stock under $100.');
 await form.getByLabel('Stop after the condition is met').check();await form.getByLabel('I reviewed these instructions',{exact:false}).check();
 await form.getByRole('button',{name:'Save owner review'}).click();await expect(form.getByRole('alert')).toHaveText('Select the observation capability to retain each condition check.');
 await form.getByLabel('Record observation',{exact:true}).check();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const violations=await section.evaluate(async node=>(await (window as any).axe.run(node,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);expect(violations.map((v:any)=>v.id)).toEqual([]);
 await page.screenshot({path:`../../output/playwright/agent-native/${info.project.name}-routine-condition.png`,fullPage:true});
 await form.getByRole('button',{name:'Save owner review'}).click();await expect(section.getByRole('status')).toHaveText('Owner review saved. Execution remains blocked until final qualification is complete.');
 expect(submitted.configuration.responsibility).toEqual({condition:'The item is in stock under $100.',notify:'condition_met',stopWhenMet:true});expect(submitted.configuration.authority.allowedCapabilities).toEqual(['tool.record_observation']);expect(submitted.confirm).toBe(true);
});
test('routine load outage offers retry without claiming monitoring',async({page})=>{
 await page.route('**/api/routines',route=>route.fulfill({status:503,json:{error:'Fixture outage'}}));await page.goto('/manage/routines');const section=page.getByRole('region',{name:'Routines'});await expect(section.getByRole('alert')).toBeVisible();await expect(section.getByText('Monitoring',{exact:true})).toHaveCount(0);
 await page.unroute('**/api/routines');await section.getByRole('button',{name:'Retry'}).click();await expect(section.getByText('Availability watch',{exact:true})).toBeVisible();
});
