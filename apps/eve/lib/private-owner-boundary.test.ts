import { readThemePreference,THEME_STORAGE_KEY } from "./appearance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebSessionToken, requireWebAuth, webPrincipal } from "./web-auth";
import { guestDenial } from "../agent/lib/owner-gate";
import { profileComputerName } from "../agent/lib/orgo";
import { partnerPrompt } from "../agent/lib/partner-model";
import { bindOwnerBrowserStorage, ownerLocalStorage, ownerSessionStorage, isOwnerStorageKey } from "./owner-browser-storage";
const env={NODE_ENV:'production',MYEVE_OWNER_ID:'A',MYEVE_PARTNER_OWNER_ID:'B',MYEVE_ACCESS_PASSWORD:'owner-a-private-password',MYEVE_PARTNER_ACCESS_PASSWORD:'owner-b-private-password',MYEVE_SESSION_SECRET:'s'.repeat(40)};
function storage(){const values=new Map<string,string>();return {get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)},clear:()=>values.clear()};}
beforeEach(()=>{for(const [key,value] of Object.entries(env))vi.stubEnv(key,value)});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
describe('two-owner deployment service isolation',()=>{
 const request=(path:string,owner='B',method='GET')=>new Request('https://example.test'+path,{method,headers:{cookie:'myeve_session='+createWebSessionToken(process.env,Date.now(),owner)}});
 it.each(['/api/connections','/api/email','/api/email/inbox','/api/computer','/api/computer-profiles','/api/phone','/api/card','/api/receipts'])('denies partner legacy surface %s before service access',async path=>{expect((await requireWebAuth(request(path)))?.status).toBe(403);expect(await requireWebAuth(request(path,'A'))).toBeNull()});
 it.each(['/api/files','/api/threads','/api/owner-knowledge','/api/knowledge'])('retains audited owner-bound surface %s',async path=>expect(await requireWebAuth(request(path))).toBeNull());
 it('rejects an old tab after another owner signs in',async()=>{const r=request('/api/files');r.headers.set('x-myeve-browser-owner','A');expect(webPrincipal(r)).toBeNull();expect((await requireWebAuth(r))?.status).toBe(401)});
 it.each(['list_emails','read_email','search_emails','email_address','connection_search','computer','send_email'])('denies deployment credential tool %s',toolName=>expect(guestDenial({toolName,session:{auth:{current:{principalId:'B',attributes:{owner:'true'}}}}} as never)?.type).toBe('denied'));
 it('keeps the original desktop only for its explicit owner',()=>{expect(()=>profileComputerName({ownerId:'B',slug:'sofie',isPrimary:true,generation:1})).toThrow();expect(()=>profileComputerName({slug:'sofie',isPrimary:true,generation:1})).toThrow();expect(()=>profileComputerName({ownerId:'A',slug:'sofie',isPrimary:true,generation:1})).not.toThrow()});
 it('rebuilds the partner provider prompt without deployment instructions, old history or credential tools',()=>{
  const result=partnerPrompt({prompt:[{role:'system',content:'A_PRIVATE_SKILL'},{role:'user',content:[{type:'text',text:'old question'}]},{role:'assistant',content:[{type:'text',text:'A_PRIVATE_HISTORY'}]},{role:'user',content:[{type:'text',text:'my question'}]}],tools:[{type:'function',name:'read_email',inputSchema:{}},{type:'function',name:'get_knowledge',inputSchema:{}}]} as never,'B_PRIVATE_MEMORY');
  expect(JSON.stringify(result)).not.toContain('A_PRIVATE');expect(JSON.stringify(result)).toContain('B_PRIVATE_MEMORY');expect(result.tools?.map(t=>t.name)).toEqual(['get_knowledge']);
 });
 it('rejects an out-of-scope tool result before any model call',()=>expect(()=>partnerPrompt({prompt:[{role:'user',content:[{type:'text',text:'question'}]},{role:'tool',content:[{type:'tool-result',toolName:'read_email',output:{type:'text',value:'A_PRIVATE'}}]}]} as never,'')).toThrow());
 it('uses system appearance when private storage is not bound or available',()=>{
  expect(readThemePreference({getItem(){throw new Error('Private storage requires a signed owner.')}})).toBe('system');
 });
 it('reads and listens to the active owner theme namespace',()=>{
  const local=storage();vi.stubGlobal('localStorage',local);local.setItem(THEME_STORAGE_KEY,'light');
  bindOwnerBrowserStorage('A',true);ownerLocalStorage.setItem(THEME_STORAGE_KEY,'dark');expect(readThemePreference()).toBe('dark');
  bindOwnerBrowserStorage('B',false);expect(readThemePreference()).toBe('system');ownerLocalStorage.setItem(THEME_STORAGE_KEY,'light');expect(readThemePreference()).toBe('light');
  expect(isOwnerStorageKey('myeve-private:A:'+THEME_STORAGE_KEY,THEME_STORAGE_KEY)).toBe(false);expect(isOwnerStorageKey('myeve-private:B:'+THEME_STORAGE_KEY,THEME_STORAGE_KEY)).toBe(true);
 });
 it('partitions transcripts, drafts, tokens and preferences while preserving primary legacy caches',()=>{
  const local=storage(),session=storage();vi.stubGlobal('localStorage',local);vi.stubGlobal('sessionStorage',session);
  local.setItem('eve-web-chat:old','A_PRIVATE_HISTORY');session.setItem('eve-web-draft:old','A_PRIVATE_DRAFT');
  bindOwnerBrowserStorage('A',true);expect(ownerLocalStorage.getItem('eve-web-chat:old')).toBe('A_PRIVATE_HISTORY');
  for(const key of ['eve-web-chat:new','relay-admin-token','model-preference'])ownerLocalStorage.setItem(key,'A_PRIVATE');ownerSessionStorage.setItem('draft','A_PRIVATE');
  bindOwnerBrowserStorage('B',false);expect(ownerLocalStorage.length).toBe(0);expect(ownerSessionStorage.getItem('eve-web-draft:old')).toBeNull();expect(ownerSessionStorage.getItem('draft')).toBeNull();
  ownerLocalStorage.setItem('eve-web-chat:new','B_PRIVATE');bindOwnerBrowserStorage('A',true);expect(ownerLocalStorage.getItem('eve-web-chat:new')).toBe('A_PRIVATE');
 });
});
