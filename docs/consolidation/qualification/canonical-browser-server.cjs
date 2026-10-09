const {spawn}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const source=JSON.parse(readFileSync(path.join(root,'docs/verification/beta-integration/consolidation/canonical-journey.json')));
const config='/private/tmp/consolidation-canonical-browser-config.json';writeFileSync(config,JSON.stringify(source.config));
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,MYEVE_OWNER_ID:source.owner,MYEVE_ACCESS_PASSWORD:'local-canonical-fixture-password',MYEVE_SESSION_SECRET:'local-canonical-session-fixture-no-production-2026',MYEVE_BETA_MODE:'qualification',MYEVE_BETA_DATABASE_URL:'postgresql://postgres@127.0.0.1:55489/myeve_beta_phase2',MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_ENGINEERING_CONFIG:config};
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3198'],{cwd:path.join(root,'apps/eve'),env,stdio:'inherit'});
process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',code=>{process.exitCode=code??0;});
