import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,realpath,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';

const toolRequire=createRequire(new URL('./owner-driver/package.json',import.meta.url));
const packageFile=toolRequire.resolve('agent-browser/package.json');
const packageRoot=dirname(packageFile),identity=JSON.parse(await readFile(packageFile,'utf8'));
assert.equal(identity.version,'0.34.0');
assert.ok(['linux','darwin'].includes(process.platform)&&['x64','arm64'].includes(process.arch));
const native=join(packageRoot,'bin',`agent-browser-${process.platform}-${process.arch}`);
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const executable=await realpath(chromium.executablePath());
const playwrightFile=toolRequire.resolve('playwright-core/package.json');
const playwright=JSON.parse(await readFile(playwrightFile,'utf8'));
const browser=(JSON.parse(await readFile(join(dirname(playwrightFile),'browsers.json'),'utf8'))).browsers.find(b=>b.name==='chromium');
const version=execFileSync(executable,['--version'],{encoding:'utf8',timeout:10000}).trim();
assert.ok(version.includes(browser.browserVersion),'Installed browser must match the locked Playwright revision');
const cliVersion=execFileSync(process.execPath,[join(packageRoot,'bin/agent-browser.js'),'--version'],{encoding:'utf8',timeout:10000}).trim();
assert.match(cliVersion,/\b0\.34\.0\b/);
const launcher=join(packageRoot,'bin/agent-browser.js');
const record={schema:'owner-browser-provenance/v1',platform:process.platform,architecture:process.arch,driver:{version:identity.version,reportedVersion:cliVersion,launcher,nativeSha256:await hash(native),lockSha256:await hash(new URL('./owner-driver/package-lock.json',import.meta.url))},
 browser:{executable,version,revision:browser.revision,playwrightVersion:playwright.version,sha256:await hash(executable)}};
const output=resolve(process.argv[2]);await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(record,null,2)+'\n');
if(process.env.GITHUB_ENV)await appendFile(process.env.GITHUB_ENV,`AGENT_BROWSER_EXECUTABLE_PATH=${executable}\nMC_OWNER_BROWSER_PROVENANCE=${output}\nMC_OWNER_BROWSER_CLI=${launcher}\n`);
console.log(JSON.stringify(record));
