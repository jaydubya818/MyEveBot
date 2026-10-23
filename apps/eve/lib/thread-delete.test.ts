import { afterEach, expect, it, vi } from "vitest";
import { deleteThreadOnServer } from "./thread-delete.ts";
afterEach(()=>vi.unstubAllGlobals());
it.each(["", ".", ".."])("rejects invalid thread id %s without transport", async id=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  expect(await deleteThreadOnServer(id)).toBe(false);expect(fetcher).not.toHaveBeenCalled();
});
it("retains safe path encoding and reports only confirmed server success",async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:204})).mockResolvedValueOnce(new Response(null,{status:409})).mockRejectedValueOnce(new Error("offline"));vi.stubGlobal("fetch",fetcher);
  expect(await deleteThreadOnServer("thread/slash?query")).toBe(true);
  expect(fetcher).toHaveBeenCalledWith("/api/threads/thread%2Fslash%3Fquery",{method:"DELETE"});
  expect(await deleteThreadOnServer("owned")).toBe(false);
  expect(await deleteThreadOnServer("owned")).toBe(false);
});
