import { execFileSync } from "node:child_process";
import { chmod, cp, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPairingToken } from "./credentials.ts";

const source=path.dirname(fileURLToPath(import.meta.url));
const directory=path.join(os.homedir(),"Library/Application Support/Sofie Local");
const label="com.myeve.sofie-local";
const plist=path.join(os.homedir(),"Library/LaunchAgents",`${label}.plist`);
const target=`gui/${process.getuid!()}/${label}`;
const configPath=path.join(directory,"config.json");
const command=process.argv[2];
const run=(args:string[])=>execFileSync("/bin/launchctl",args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
const loaded=()=>{try{return run(["print",target]);}catch{return null;}};
const stop=async()=>{
  if(!loaded())return;
  run(["bootout",target]);
  const until=Date.now()+90000;
  while(loaded() && Date.now()<until)await new Promise(resolve=>setTimeout(resolve,250));
  if(loaded())throw new Error("Companion shutdown is still pending; do not start a second worker.");
};
const start=()=>{if(!loaded())run(["bootstrap",`gui/${process.getuid!()}`,plist]);};
const xml=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
if(process.platform!=="darwin")throw new Error("Sofie Local service requires macOS.");
if(command==="install") {
  if(loaded())throw new Error("Stop the installed companion before updating its files.");
  const oldPath=path.resolve(process.argv[3]??path.join(source,"../../.local-computer/config.json"));
  const config=JSON.parse(await readFile(oldPath,"utf8"));
  if(!config.deviceId || !Array.isArray(config.roots) || !config.roots.length)throw new Error("An existing explicit pairing and shared roots are required.");
  const url=new URL(config.appUrl);
  if(url.protocol!=="https:" || url.username || url.password)throw new Error("Production pairing must use HTTPS.");
  const roots=await Promise.all(config.roots.map((s:string)=>realpath(s)));
  await mkdir(directory,{recursive:true,mode:0o700}); await chmod(directory,0o700);
  const helper=path.join(directory,"credential-helper");
  // Keep this native executable stable: rebuilding can change its Keychain identity.
  try{await readFile(helper);}catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
    execFileSync("/usr/bin/swiftc",["-module-cache-path",path.join(directory,"swift-cache"),path.join(source,"credential-helper.swift"),"-o",helper,"-framework","Security"],{stdio:"inherit"});
  }
  const token=config.token??readPairingToken(config.credentialHelper,config.keychainAccount);
  if(typeof token!=="string" || token.length<32)throw new Error("Invalid pairing credential.");
  let existing:string|undefined;
  try{existing=readPairingToken(helper,config.deviceId);}catch{/* New Keychain identity. */}
  if(existing && existing!==token)throw new Error("Existing Keychain identity differs; explicit re-pairing is required.");
  if(!existing)execFileSync(helper,["store",config.deviceId],{input:token,stdio:["pipe","ignore","pipe"],timeout:10000});
  if(readPairingToken(helper,config.deviceId)!==token)throw new Error("Keychain verification failed; original pairing retained.");
  const saved={appUrl:url.origin,deviceId:config.deviceId,roots,helper:config.helper,credentialHelper:helper,keychainAccount:config.deviceId};
  if(path.dirname(oldPath)!==directory) {
    await cp(path.join(path.dirname(oldPath),"claims"),path.join(directory,"claims"),{recursive:true,force:false,errorOnExist:false}).catch(error=>{if(error.code!=="ENOENT")throw error;});
  }
  await writeFile(`${configPath}.tmp`,JSON.stringify(saved,null,2)+"\n",{mode:0o600}); await rename(`${configPath}.tmp`,configPath);
  const workerFile=path.join(directory,"worker.mjs");
  await build({entryPoints:[path.join(source,"worker.ts")],outfile:`${workerFile}.tmp`,bundle:true,platform:"node",format:"esm",target:"node24"});
  await rename(`${workerFile}.tmp`,workerFile);
  let node=process.execPath;
  for(const candidate of ["/opt/homebrew/bin/node","/usr/local/bin/node"])try{if(await realpath(candidate)===await realpath(node)){node=candidate;break;}}catch{}
  const app=path.join(directory,"Sofie Local.app");
  const executable=path.join(app,"Contents/MacOS/SofieLocal");
  try{await readFile(executable);}catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
    await mkdir(path.dirname(executable),{recursive:true});
    await writeFile(path.join(app,"Contents/Info.plist"),`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.myeve.sofie-local</string><key>CFBundleName</key><string>Sofie Local</string>
<key>CFBundleDisplayName</key><string>Sofie Local</string><key>CFBundleExecutable</key><string>SofieLocal</string>
<key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string>
<key>LSUIElement</key><true/></dict></plist>`);
    execFileSync("/usr/bin/swiftc",["-module-cache-path",path.join(directory,"swift-cache"),path.join(source,"launcher.swift"),"-o",executable],{stdio:"inherit"});
    execFileSync("/usr/bin/codesign",["--sign","-",app],{stdio:"inherit"});
  }
  await mkdir(path.dirname(plist),{recursive:true});
  await writeFile(plist,`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>AssociatedBundleIdentifiers</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(executable)}</string><string>${xml(node)}</string><string>${xml(path.join(directory,"worker.mjs"))}</string></array>
<key>EnvironmentVariables</key><dict><key>SOFIE_LOCAL_CONFIG</key><string>${xml(configPath)}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>10</integer><key>ExitTimeOut</key><integer>90</integer>
<key>WorkingDirectory</key><string>${xml(directory)}</string><key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(path.join(directory,"stdout.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(directory,"stderr.log"))}</string>
</dict></plist>\n`,{mode:0o600});
  // Erase only the old pairing plaintext after successful Keychain readback.
  if(oldPath!==configPath)await writeFile(oldPath,JSON.stringify(saved,null,2)+"\n",{mode:0o600});
  const oldEnv=path.join(path.dirname(oldPath),"server.env");
  const env=await readFile(oldEnv,"utf8").catch(()=>"");
  if(env.includes(`SOFIE_LOCAL_DEVICE_TOKEN=${token}`))await unlink(oldEnv);
  console.log("Installed Sofie Local with Keychain custody. Shared roots and desktop permissions are unchanged. Run local:service start after stopping any old manual companion.");
} else if(command==="start") {start();console.log("Sofie Local started; check status for authenticated readiness.");}
else if(command==="stop") {await stop();console.log("Sofie Local stopped. Login startup remains installed.");}
else if(command==="restart") {await stop();start();console.log("Sofie Local restarted.");}
else if(command==="status") {
  const service=loaded(); const health=JSON.parse(await readFile(path.join(directory,"health.json"),"utf8").catch(()=>"{}"));
  const fresh=Number.isFinite(Date.parse(health.at))&&Date.now()-Date.parse(health.at)<30000;
  const connectionReady=!!service&&/\n\s*state = running/.test(service)&&(service.includes(`pid = ${health.pid}\n`)||service.includes(`pid = ${health.parentPid}\n`))&&fresh&&health.status==="ready";
  const desktopReady=connectionReady&&health.permissions?.accessibility===true;
  const screenshotReady=connectionReady&&health.permissions?.screenRecording===true;
  console.log(JSON.stringify({installed:!!(await readFile(plist).catch(()=>null)),loaded:!!service,connectionReady,desktopReady,screenshotReady,ready:connectionReady&&desktopReady&&screenshotReady,health},null,2));
} else if(command==="unpair") {
  const config=JSON.parse(await readFile(configPath,"utf8"));
  const token=readPairingToken(config.credentialHelper,config.keychainAccount);
  const response=await fetch(new URL("/api/local-computer/worker",config.appUrl),{method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({operation:"revoke"})});
  if(!response.ok)throw new Error("Server revocation was not confirmed; pairing retained. Stop the service and retry revocation when connected.");
  await stop();execFileSync(config.credentialHelper,["delete",config.keychainAccount],{stdio:["ignore","ignore","pipe"]});
  await unlink(plist);await writeFile(configPath,JSON.stringify({...config,revoked:true},null,2)+"\n",{mode:0o600});
  console.log("Computer unpaired: server authority revoked, local Keychain credential removed, login service removed.");
} else throw new Error("Usage: local:service install [existing-config] | start | stop | restart | status | unpair");
