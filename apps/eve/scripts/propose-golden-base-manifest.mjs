// Read-only proposal for human review; intake requires a separately pinned manifest file.
import { GitHubAdapter } from '../lib/engineering/github.ts';
import { githubAppTokenProvider } from '../lib/engineering/github-app.ts';
import { GOLDEN_QUALIFICATION_REPOSITORY, GOLDEN_QUALIFICATION_BASE_SHA, manifestForSnapshot } from '../lib/engineering/base-preflight.ts';

const appId=Number(process.env.GOLDEN_GITHUB_APP_ID);
const installationId=Number(process.env.GOLDEN_GITHUB_INSTALLATION_ID);
if(!Number.isSafeInteger(appId)||appId<1||!Number.isSafeInteger(installationId)||installationId<1)
  throw Error('Non-secret GitHub App and installation IDs are required.');
const token=githubAppTokenProvider({appId,installationId,repository:GOLDEN_QUALIFICATION_REPOSITORY,
  keychainService:'myeve-golden-work-publisher',keychainAccount:'jaydubya818'});
const snapshot=await new GitHubAdapter(GOLDEN_QUALIFICATION_REPOSITORY,token).snapshot('main');
if(snapshot.sha!==GOLDEN_QUALIFICATION_BASE_SHA)
  throw Error('main moved from the owner-approved base; no manifest proposal was generated.');
const manifest=manifestForSnapshot(snapshot);
if(manifest.files.length!==5||manifest.files.some(file=>file.path==='quantity.mjs')||
  !['.github/workflows/quantity-ci.yml','package.json','test/quantity.test.mjs'].every(path=>
    manifest.files.some(file=>file.path===path)))
  throw Error('The pinned base does not match the bounded five-file Golden Work fixture.');
process.stdout.write(`${JSON.stringify(manifest,null,2)}\n`);
