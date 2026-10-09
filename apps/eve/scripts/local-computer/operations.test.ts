import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {mkdtemp,mkdir,writeFile,symlink,readFile,rm,realpath} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {executeLocalOperation,resolveSharedPath,runLocalShell} from "./operations.ts";
let root:string;
beforeEach(async()=>{root=await realpath(await mkdtemp(path.join(os.tmpdir(),"sofie-local-test-")));});
afterEach(async()=>{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});});
describe("local companion operations",()=>{
  it("finds and reads a README without an exact path from the owner",async()=>{
    await mkdir(path.join(root,"project"));await writeFile(path.join(root,"project","README.md"),"# My app");
    for(const name of ["README*","*.md","read?e.md"]) {
      const matches=JSON.parse((await executeLocalOperation({operation:"find_files",path:root,name},[root],"unused")).text);
      expect(matches.entries).toEqual([{path:path.join(root,"project","README.md"),type:"file"}]);
    }
    const found=JSON.parse((await executeLocalOperation({operation:"find_files",path:root,name:"readme"},[root],"unused")).text);
    expect(found.entries).toEqual([{path:path.join(root,"project","README.md"),type:"file"}]);
    const read=JSON.parse((await executeLocalOperation({operation:"read_text",path:found.entries[0].path},[root],"unused")).text);
    expect(read.content).toBe("# My app");expect(read.sha256).toHaveLength(64);
  });
  it("rejects traversal, symlinks into private paths, and credentials",async()=>{
    await writeFile(path.join(root,".env.local"),"private");await symlink(path.join(root,".env.local"),path.join(root,"visible"));
    for(const file of [path.join(root,".env.local"),path.join(root,"visible"),"/etc/passwd",path.join(root,"../outside")])await expect(resolveSharedPath(file,[root])).rejects.toThrow();
  });
  it("does not list private config or traverse symbolic links",async()=>{
    await mkdir(path.join(root,".local-computer"));await writeFile(path.join(root,".local-computer","config.json"),"secret");await symlink("/etc",path.join(root,"escape"));
    const listing=JSON.parse((await executeLocalOperation({operation:"list_files",path:root},[root],"unused")).text);
    expect(listing.entries).toEqual([]);
  });
  it("requires the current hash to overwrite and does not replace files on create",async()=>{
    const file=path.join(root,"note.txt");await writeFile(file,"original");
    await expect(executeLocalOperation({operation:"write_text",path:file,content:"bad",expected_sha256:null},[root],"unused")).rejects.toThrow();
    await expect(executeLocalOperation({operation:"write_text",path:file,content:"bad",expected_sha256:"0".repeat(64)},[root],"unused")).rejects.toThrow();
    expect(await readFile(file,"utf8")).toBe("original");
    const before=JSON.parse((await executeLocalOperation({operation:"read_text",path:file},[root],"unused")).text);
    await executeLocalOperation({operation:"write_text",path:file,content:"approved",expected_sha256:before.sha256},[root],"unused");
    expect(await readFile(file,"utf8")).toBe("approved");
  });
  it("does not pass the pairing token into child shells",async()=>{
    vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN","test-secret-not-for-child");
    const result=await runLocalShell("print -r -- ${SOFIE_LOCAL_DEVICE_TOKEN-unset}");
    expect(result.isError).toBe(false);expect(JSON.parse(result.text).output.trim()).toBe("unset");
  });
});
