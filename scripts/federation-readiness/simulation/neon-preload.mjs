// Loaded explicitly by the local test harness, never selected by hosted CLI.
import {createRequire} from 'node:module';
if(process.env.NODE_ENV!=='test'||new URL(process.env.FQ_CONTROLLER_URL).hostname!=='127.0.0.1'||(process.env.FQ_LOCAL_SQL_PROXY&&new URL(process.env.FQ_LOCAL_SQL_PROXY).hostname!=='127.0.0.1'))throw Error('DISPOSABLE_LOCAL_TEST_ONLY');
const require=createRequire(`${process.cwd()}/package.json`);
if(process.env.FQ_LOCAL_SQL_PROXY){const {neonConfig}=await import(require.resolve('@neondatabase/serverless').replace(/index\.js$/,'index.mjs'));neonConfig.fetchEndpoint=()=>process.env.FQ_LOCAL_SQL_PROXY;require('@neondatabase/serverless').neonConfig.fetchEndpoint=()=>process.env.FQ_LOCAL_SQL_PROXY;}
