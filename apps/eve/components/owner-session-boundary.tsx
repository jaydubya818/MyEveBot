"use client";
import { useEffect, useState, type ReactNode } from "react";
import { bindOwnerBrowserStorage, OWNER_BROWSER_EVENT, OWNER_BROWSER_HEADER } from "@/lib/owner-browser-storage";

/** Mount no private UI until authentication and its storage namespace agree. */
export function OwnerSessionBoundary({children}:{children:ReactNode}) {
 const [ready,setReady]=useState(false);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  if(window.location.pathname==='/login'){setReady(true);return;}
  let disposed=false;
  const original=window.fetch.bind(window);
  const changed=()=>{setReady(false); window.location.replace('/login?returnTo='+encodeURIComponent(window.location.pathname));};
  const storage=(event:StorageEvent)=>{if(event.key===OWNER_BROWSER_EVENT)changed();};
  window.addEventListener('storage',storage);window.addEventListener(OWNER_BROWSER_EVENT,changed);
  void original('/api/auth/status',{cache:'no-store'}).then(async response=>{
   const status=await response.json();
   if(disposed)return;
   if(!status.authenticated || typeof status.ownerId!=='string'){changed();return;}
   bindOwnerBrowserStorage(status.ownerId,status.isPrimary===true);
   window.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input),window.location.href);
    if(url.origin!==window.location.origin || !/^\/(api|eve)(\/|$)/.test(url.pathname) || url.pathname.startsWith('/api/auth/'))return original(input,init);
    const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
    headers.set(OWNER_BROWSER_HEADER,status.ownerId);
    const result=await original(input,{...init,headers});
    if(result.status===401)changed();
    return result;
   };
   setReady(true);
  }).catch(()=>{if(!disposed)setFailed(true);});
  return()=>{disposed=true;window.fetch=original;window.removeEventListener('storage',storage);window.removeEventListener(OWNER_BROWSER_EVENT,changed);};
 },[]);
 return ready?children:<main className="p-8" role="status">{failed?'Could not verify your session. Reload to try again.':'Opening your private workspace…'}</main>;
}
