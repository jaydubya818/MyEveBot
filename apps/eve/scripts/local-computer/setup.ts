import { mkdir, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
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
await writeFile(path.join(directory,"config.json"),JSON.stringify({appUrl:url.origin,token,deviceId,roots,helper},null,2)+"\n",{mode:0o600,flag:"wx"});
await writeFile(path.join(directory,"server.env"),`SOFIE_LOCAL_DEVICE_ID=${deviceId}\nSOFIE_LOCAL_DEVICE_TOKEN=${token}\n`,{mode:0o600,flag:"wx"});
console.log(`Pairing saved privately in ${directory}. Configure the app server with server.env, then run npm run local:start. Do not paste the token into chat.`);
console.log(`For desktop actions, allow ${helper} in macOS Privacy & Security → Accessibility and Screen Recording. File reads and shell do not require these permissions.`);
