import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

/** OS-backed SQLite lock releases on process death; PID files alone are racy. */
export async function acquireCompanionLock(directory:string) {
  const lock=new DatabaseSync(path.join(directory,"worker-lock.sqlite"));
  try {lock.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;");}
  catch {lock.close();throw new Error("A companion process is already running.");}
  const pidFile=path.join(directory,"worker.pid");
  try {await writeFile(pidFile,String(process.pid),{mode:0o600});}
  catch(error){lock.close();throw error;}
  return async()=>{
    if((await readFile(pidFile,"utf8").catch(()=>""))===String(process.pid))await unlink(pidFile);
    lock.exec("ROLLBACK");lock.close();
  };
}
export async function writeHealth(directory:string,status:string,extra:Record<string,unknown>={}) {
  const file=path.join(directory,"health.json"),temporary=`${file}.${process.pid}.tmp`;
  await writeFile(temporary,JSON.stringify({status,pid:process.pid,parentPid:process.ppid,at:new Date().toISOString(),...extra})+"\n",{mode:0o600});
  await rename(temporary,file);
}
