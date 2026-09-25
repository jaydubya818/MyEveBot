import {spawn} from 'node:child_process';
import {once} from 'node:events';
/** No child restart. Credentials are explicit per-child allowlist; the controller
 * DB credential, provider key and infrastructure token never reach the worker. */
export async function supervise({command,cwd,environment,sourceSha,heartbeat,lifetimeMs=2700000,intervalMs=5000,killGraceMs=5000,stdio='ignore'}) {
 if(!Array.isArray(command)||!command.length||!/^[a-f0-9]{40}$/.test(sourceSha)||lifetimeMs<1||lifetimeMs>3600000||intervalMs>5000||killGraceMs>5000)throw Error('INVALID_WORKER');
 for(const name of Object.keys(environment))if(/GOOGLE_APPLICATION_CREDENTIALS|RELAY_SIGNING_PRIVATE_KEY|FQ_CONTROL_DATABASE|VERCEL_TOKEN|RAILWAY_TOKEN|AI_GATEWAY_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY|BLOB_READ_WRITE_TOKEN|MYEVE_RELAY_INGRESS_SECRETS/.test(name))throw Error('PRIVILEGED_WORKER_CREDENTIAL');
 const registration=await heartbeat(sourceSha);if(registration.sha!==sourceSha||!registration.session||registration.deadline*1000<=Date.now())throw Error('WORKER_REGISTRATION_DENIED');
 const remaining=Math.min(lifetimeMs,registration.deadline*1000-Date.now());
 const child=spawn(command[0],command.slice(1),{cwd,env:environment,detached:true,stdio});
 let stopped=false,killTimer;const exited=once(child,'exit');
 function stop(){if(stopped)return;stopped=true;try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},killGraceMs);}
 let polling=false;
 const timer=setInterval(async()=>{if(polling)return;polling=true;try{const result=await heartbeat(sourceSha);if(result.sha!==sourceSha||result.session!==registration.session||result.deadline*1000<=Date.now())stop();}catch{stop();}finally{polling=false;}},intervalMs);
 const deadline=setTimeout(stop,remaining);process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{await exited;try{process.kill(-child.pid,'SIGKILL');}catch{}return {sourceSha,session:registration.session,stopped,exited:true};}finally{clearInterval(timer);clearTimeout(deadline);if(killTimer)clearTimeout(killTimer);process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
