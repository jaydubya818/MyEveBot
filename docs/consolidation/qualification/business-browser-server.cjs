const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const source=JSON.parse(fs.readFileSync('/private/tmp/business-browser-fixture.json'));
if(!/^myeve_beta_scopes_[a-f0-9]+$/.test(source.database))throw Error('Disposable database required');
const root=path.resolve(__dirname,'../../..');
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3199'],{cwd:path.join(root,'apps/eve'),env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,MYEVE_OWNER_ID:'A',MYEVE_ACCESS_PASSWORD:'owner-a-private-password',MYEVE_PARTNER_OWNER_ID:'B',MYEVE_PARTNER_ACCESS_PASSWORD:'owner-b-private-password',MYEVE_SESSION_SECRET:'business-local-only-session-fixture-2026',MYEVE_BETA_MODE:'qualification',MYEVE_BETA_DATABASE_URL:'postgresql://postgres@127.0.0.1:55489/'+source.database},stdio:'inherit'});
process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',code=>process.exitCode=code??0);
