import {describe,it,expect} from "vitest";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {acquireCompanionLock,writeHealth} from "./lifecycle.ts";
describe("Computer process lifecycle",()=>{
  it("excludes a second process, releases cleanly and recovers a dead process",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"computer-life-"));
    try{
      const release=await acquireCompanionLock(dir);
      await expect(acquireCompanionLock(dir)).rejects.toThrow("already running");
      await writeHealth(dir,"ready",{permissions:{screenRecording:false}});
      expect(JSON.parse(await readFile(path.join(dir,"health.json"),"utf8"))).toMatchObject({status:"ready",pid:process.pid});
      await release();
      await writeFile(path.join(dir,"worker.pid"),"2147483647");
      const recovered=await acquireCompanionLock(dir);await recovered();
    }finally{await rm(dir,{recursive:true,force:true});}
  });
});
