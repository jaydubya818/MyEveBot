/** Browser persistence is unavailable until the signed owner has been resolved. */
let owner: string | null = null;
let primary = false;
export const OWNER_BROWSER_HEADER = "x-myeve-browser-owner";
export const OWNER_BROWSER_EVENT = "myeve-owner-session-changed";
export function bindOwnerBrowserStorage(id: string, isPrimary: boolean) { owner=id; primary=isPrimary; }
export function invalidateOwnerBrowserSession() {
 owner=null;
 window.localStorage.setItem(OWNER_BROWSER_EVENT, crypto.randomUUID());
 window.dispatchEvent(new Event(OWNER_BROWSER_EVENT));
}
function storage(session: boolean) {
 const native=()=>session?globalThis.sessionStorage:globalThis.localStorage;
 const prefix=()=>{if(!owner)throw new Error("Private storage requires a signed owner."); return `myeve-private:${encodeURIComponent(owner)}:`;};
 const keys=()=>{const p=prefix(), s=native(); const all=Array.from({length:s.length},(_,i)=>s.key(i)!).filter(Boolean); return [...new Set(all.flatMap(k=>k.startsWith(p)?[k.slice(p.length)]:primary&&!k.startsWith('myeve-private:')&&k!==OWNER_BROWSER_EVENT?[k]:[]))];};
 return {
  get length(){return keys().length;}, key(index:number){return keys()[index]??null;},
  getItem(key:string){const p=prefix(),s=native(); return s.getItem(p+key) ?? (primary?s.getItem(key):null);},
  setItem(key:string,value:string){native().setItem(prefix()+key,value);},
  removeItem(key:string){const p=prefix(),s=native();s.removeItem(p+key);if(primary)s.removeItem(key);},
  clear(){for(const key of keys())this.removeItem(key);},
 };
}
export const ownerLocalStorage=storage(false);
export const ownerSessionStorage=storage(true);
