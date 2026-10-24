// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({bind:vi.fn()}));
vi.mock("@/lib/owner-browser-storage",()=>({bindOwnerBrowserStorage:mocks.bind,OWNER_BROWSER_EVENT:"fixture-owner-changed",OWNER_BROWSER_HEADER:"x-myeve-browser-owner"}));
import { OwnerSessionBoundary } from "./owner-session-boundary";
let root:ReturnType<typeof createRoot>|undefined,container:HTMLDivElement;
beforeEach(()=>{vi.clearAllMocks();window.history.replaceState(null,"","/settings?pane=security");container=document.createElement("div");document.body.appendChild(container);});
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function mount(){await act(async()=>{root=createRoot(container);root.render(<OwnerSessionBoundary><p>Private content</p></OwnerSessionBoundary>);await Promise.resolve();});}
it("does not mount private UI after non-successful status and retains a retry",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({authenticated:true,ownerId:"foreign"}),{status:503})));
  await mount();expect(container.textContent).not.toContain("Private content");expect(container.textContent).toContain("Try again");expect(mocks.bind).not.toHaveBeenCalled();
});
it.each(["/login","/forgot-password","/reset-password"])("keeps the public recovery route %s outside the private gate",async path=>{
  window.history.replaceState(null,"",path);const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);await mount();expect(container.textContent).toContain("Private content");expect(fetcher).not.toHaveBeenCalled();
});
it("rechecks a persisted page without discarding a valid session and removes the listener on unmount",async()=>{
  const reload=vi.spyOn(window.location,"reload").mockImplementation(()=>{});
  const replace=vi.spyOn(window.location,"replace").mockImplementation(()=>{});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({authenticated:true,ownerId:"owner",isPrimary:true})));
  await mount();expect(container.textContent).toContain("Private content");
  const restored=()=>{const e=new Event("pageshow");Object.defineProperty(e,"persisted",{value:true});window.dispatchEvent(e);};
  await act(async()=>restored());expect(reload).toHaveBeenCalledTimes(1);expect(replace).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("Private content");
  act(()=>root!.unmount());root=undefined;restored();expect(reload).toHaveBeenCalledTimes(1);
});
it("aborts status on unmount and never binds a late owner response",async()=>{
  let finish!:(response:Response)=>void;let signal:AbortSignal|undefined;
  vi.stubGlobal("fetch",vi.fn().mockImplementation((_url,init)=>{signal=init.signal;return new Promise<Response>(yes=>{finish=yes;});}));
  await mount();expect(signal).toBeInstanceOf(AbortSignal);
  act(()=>root!.unmount());root=undefined;expect(signal!.aborted).toBe(true);
  await act(async()=>finish(Response.json({authenticated:true,ownerId:"late-owner",isPrimary:true})));
  expect(mocks.bind).not.toHaveBeenCalled();
});
