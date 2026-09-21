import {readFileSync,openSync} from 'node:fs';
import {runWorker} from '../controls/worker-entrypoint.mjs';
const fixture=JSON.parse(readFileSync(process.argv[2]));
if(process.env.NODE_ENV!=='test'||new URL(fixture.environment.FQ_CONTROLLER_URL).hostname!=='127.0.0.1')throw Error('LOCAL_TEST_ONLY');
Object.assign(process.env,fixture.environment);
fixture.localTest.stdio=['ignore',openSync(fixture.log,'a',0o600),openSync(fixture.log,'a',0o600)];
try{const result=await runWorker({component:fixture.component,cwd:fixture.source,environment:fixture.environment,localTest:fixture.localTest});if(!result.stopped)process.exitCode=1;}
catch(error){console.error(error.message);process.exitCode=1;}
