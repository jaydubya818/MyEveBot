/** Browser persistence is unavailable until the signed owner has been resolved. */
let owner: string | null = null;
let primary = false;
const localFallback = new Map<string, string | null>();
const sessionFallback = new Map<string, string | null>();
function clearFallback() { localFallback.clear(); sessionFallback.clear(); }
export const OWNER_BROWSER_HEADER = "x-myeve-browser-owner";
export const OWNER_BROWSER_EVENT = "myeve-owner-session-changed";
export function bindOwnerBrowserStorage(id: string, isPrimary: boolean) {
 if(owner!==id)clearFallback();
 owner=id; primary=isPrimary;
}
export function invalidateOwnerBrowserSession() {
 owner=null;
 clearFallback();
 try { window.localStorage.setItem(OWNER_BROWSER_EVENT, crypto.randomUUID()); }
 finally { window.dispatchEvent(new Event(OWNER_BROWSER_EVENT)); }
}
function storage(session: boolean) {
 const native=()=>session?globalThis.sessionStorage:globalThis.localStorage;
 const fallback=session?sessionFallback:localFallback;
 const prefix=()=>{if(!owner)throw new Error("Private storage requires a signed owner."); return `myeve-private:${encodeURIComponent(owner)}:`;};
 const keys=()=>{
  const p=prefix(); let all:string[]=[];
  try { const s=native(); all=Array.from({length:s.length},(_,i)=>s.key(i)!).filter(Boolean); } catch { /* Current-page fallback remains available. */ }
  return [...new Set([...all,...fallback.keys()].flatMap(k=>fallback.get(k)===null?[]:k.startsWith(p)?[k.slice(p.length)]:primary&&!k.startsWith('myeve-private:')&&k!==OWNER_BROWSER_EVENT?[k]:[]))];
 };
 return {
  get length(){return keys().length;}, key(index:number){return keys()[index]??null;},
  getItem(key:string){
   const p=prefix();
   if(fallback.has(p+key))return fallback.get(p+key)!;
   try { const s=native(); return s.getItem(p+key) ?? (primary?s.getItem(key):null); }
   catch { return null; }
  },
  setItem(key:string,value:string){
   const scoped=prefix()+key;
   // Retain the live chat if quota is exhausted. Server persistence still runs;
   // losing this copy otherwise makes chat recovery repeatedly remount the composer.
   try { native().setItem(scoped,value); fallback.delete(scoped); }
   catch { fallback.set(scoped,value); }
  },
  removeItem(key:string){
   const p=prefix(); fallback.set(p+key,null);
   try { const s=native();s.removeItem(p+key);if(primary)s.removeItem(key);fallback.delete(p+key); }
   catch { /* Tombstone prevents an older disk value from reappearing. */ }
  },
  clear(){for(const key of keys())this.removeItem(key);},
 };
}
export const ownerLocalStorage=storage(false);
export const ownerSessionStorage=storage(true);

export function isOwnerStorageKey(key:string|null,logicalKey:string){return !!owner && (key===`myeve-private:${encodeURIComponent(owner)}:${logicalKey}` || (primary&&key===logicalKey));}
