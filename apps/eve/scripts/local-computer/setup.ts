import { mkdir, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source=path.dirname(fileURLToPath(import.meta.url));
const directory=path.resolve(source,"../../.local-computer");
const appUrl=process.argv[2];
const roots=process.argv.slice(3).map(root=>path.resolve(root));
if(!appUrl || !roots.length)throw new Error("Usage: npm run local:setup -- https://your-app.example /absolute/shared/folder [...]");
const url=new URL(appUrl);
if(url.protocol!=="https:" && !(url.protocol==="http:" && ["localhost","127.0.0.1"].includes(url.hostname)))throw new Error("HTTPS is required except for local development.");
await mkdir(directory,{recursive:true,mode:0o700});
try{await access(path.join(directory,"config.json"));throw new Error("Pairing already exists. Preserve it or explicitly rotate the device token before setup.");}
catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
const helper=path.join(directory,"sofie-local-desktop");
execFileSync("/usr/bin/swiftc",["-module-cache-path",path.join(directory,"swift-cache"),path.join(source,"desktop.swift"),"-o",helper,"-framework","AppKit","-framework","ApplicationServices","-framework","ScreenCaptureKit"],{stdio:"inherit"});
const token=randomBytes(32).toString("hex");
const deviceId=`mac-${randomBytes(8).toString("hex")}`;
const credentialDirectory=path.join(os.homedir(),"Library/Application Support/Sofie Local");
await mkdir(credentialDirectory,{recursive:true,mode:0o700});
const credentialHelper=path.join(credentialDirectory,"credential-helper");
try{await access(credentialHelper);}catch(error){
  if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
  execFileSync("/usr/bin/swiftc",["-module-cache-path",path.join(credentialDirectory,"swift-cache"),path.join(source,"credential-helper.swift"),"-o",credentialHelper,"-framework","Security"],{stdio:"inherit"});
}
execFileSync(credentialHelper,["store",deviceId],{input:token,stdio:["pipe","ignore","pipe"]});
await writeFile(path.join(directory,"config.json"),JSON.stringify({appUrl:url.origin,deviceId,roots,helper,credentialHelper,keychainAccount:deviceId},null,2)+"\n",{mode:0o600,flag:"wx"});
console.log(`Pairing metadata saved in ${directory}; secret retained only in macOS Keychain. Configure SOFIE_LOCAL_DEVICE_ID and securely pipe this Keychain item's value into the deployment's encrypted SOFIE_LOCAL_DEVICE_TOKEN setting. Do not paste it into chat or save an env file.`);
console.log("Set explicit SOFIE_LOCAL_CAPABILITIES, apply migrations, then run local:service install and local:service start.");
console.log(`For desktop actions, allow ${helper} in macOS Privacy & Security → Accessibility and Screen Recording. File reads and shell do not require these permissions.`);
