import {spawn} from 'node:child_process';
// Local dogfood restart supervision. Durable PostgreSQL state owns recovery.
if(process.env.MYEVE_ENGINEERING_MODE!=='dogfood'||process.env.VERCEL_ENV==='production')throw Error('Isolated dogfood only');
let child,stopping=false;
const stop=()=>{stopping=true;child?.kill('SIGTERM');};process.on('SIGTERM',stop);process.on('SIGINT',stop);
while(!stopping){
  child=spawn(process.execPath,['--import','tsx',new URL('./engineering-worker.ts',import.meta.url).pathname],{stdio:'inherit',env:process.env});
  console.log('Golden Work worker process',child.pid);
  await new Promise(resolve=>child.once('exit',resolve));
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,2000));
}
