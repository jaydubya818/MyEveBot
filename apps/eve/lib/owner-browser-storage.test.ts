import { afterEach, expect, it, vi } from 'vitest';
import { bindOwnerBrowserStorage, ownerLocalStorage, ownerSessionStorage } from './owner-browser-storage';
function quotaStorage() {
  const values=new Map<string,string>();
  return {get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,
    getItem:(key:string)=>values.get(key)??null,
    setItem:(_key:string,_value:string)=>{throw new DOMException('Quota full','QuotaExceededError');},
    removeItem:(key:string)=>{values.delete(key);},clear:()=>values.clear()};
}
afterEach(()=>{vi.unstubAllGlobals();bindOwnerBrowserStorage('reset',false);});
it('retains the current chat when browser quota prevents persistence',()=>{
 vi.stubGlobal('localStorage',quotaStorage());bindOwnerBrowserStorage('owner-a',false);
 ownerLocalStorage.setItem('eve-web-chat:test',JSON.stringify({session:{sessionId:'run-a'},events:[{type:'turn.completed'}]}));
 expect(JSON.parse(ownerLocalStorage.getItem('eve-web-chat:test')!)).toMatchObject({session:{sessionId:'run-a'}});
});
it('does not carry failed writes between owners or storage areas',()=>{
 vi.stubGlobal('localStorage',quotaStorage());vi.stubGlobal('sessionStorage',quotaStorage());bindOwnerBrowserStorage('owner-a',false);
 ownerLocalStorage.setItem('chat','private-a');expect(ownerSessionStorage.getItem('chat')).toBeNull();
 bindOwnerBrowserStorage('owner-b',false);expect(ownerLocalStorage.getItem('chat')).toBeNull();
 bindOwnerBrowserStorage('owner-a',false);expect(ownerLocalStorage.getItem('chat')).toBeNull();
});
it('keeps failed overwrites newer than disk and resumes persistent writes',()=>{
 const values=new Map<string,string>();let quotaFull=false;
 const storage={...quotaStorage(),getItem:(key:string)=>values.get(key)??null,
  setItem:(key:string,value:string)=>{if(quotaFull)throw new DOMException('Quota full','QuotaExceededError');values.set(key,value);}};
 vi.stubGlobal('localStorage',storage);bindOwnerBrowserStorage('owner-c',false);
 ownerLocalStorage.setItem('chat','old');quotaFull=true;
 ownerLocalStorage.setItem('chat','new');expect(ownerLocalStorage.getItem('chat')).toBe('new');
 quotaFull=false;ownerLocalStorage.setItem('chat','persisted');
 bindOwnerBrowserStorage('other',false);bindOwnerBrowserStorage('owner-c',false);
 expect(ownerLocalStorage.getItem('chat')).toBe('persisted');
});
it('removes failed writes and lists only the current owner fallback',()=>{
 vi.stubGlobal('localStorage',quotaStorage());bindOwnerBrowserStorage('owner-d',false);
 ownerLocalStorage.setItem('chat','private');expect(ownerLocalStorage.length).toBe(1);expect(ownerLocalStorage.key(0)).toBe('chat');
 ownerLocalStorage.removeItem('chat');expect(ownerLocalStorage.getItem('chat')).toBeNull();expect(ownerLocalStorage.length).toBe(0);
});
it('requires a signed owner even when using the current-page fallback',()=>{
 vi.stubGlobal('localStorage',quotaStorage());bindOwnerBrowserStorage('',false);
 expect(()=>ownerLocalStorage.setItem('chat','private')).toThrow('signed owner');
 expect(()=>ownerLocalStorage.getItem('chat')).toThrow('signed owner');
});
