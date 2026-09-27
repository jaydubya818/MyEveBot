import fs from 'node:fs';import crypto from 'node:crypto';
const original=globalThis.fetch;const dir="/private/tmp/m1er1-b4801cb",allowedGitHub=["/repos/jaydubya818/myeve-golden-work-qual","/repos/jaydubya818/myeve-golden-work-qual/commits/db5d95cf3d1dadf04a118f38bd5b388a5a226c31","/repos/jaydubya818/myeve-golden-work-qual/git/trees/f9a6e11fee187537f47a6761accd5a43cf760101","/repos/jaydubya818/myeve-golden-work-qual/git/blobs/a7b757eb3a7337a713a73a60b6933cac60d1dc4a","/repos/jaydubya818/myeve-golden-work-qual/git/blobs/c2658d7d1b31848c3b71960543cb0368e56cd4c7","/repos/jaydubya818/myeve-golden-work-qual/git/blobs/0ac70bb1e3e50d7907439834a922e2b112e9cab0","/repos/jaydubya818/myeve-golden-work-qual/git/blobs/ba6360501e7d1cabcc690ceeb0d8f14e1b58af0e","/repos/jaydubya818/myeve-golden-work-qual/git/blobs/9b76cf0ac91c3ded66534eb98ce9c8db8c88593b"];
globalThis.fetch=async(input,init)=>{const headers=new Headers(init?.headers),url=new URL(typeof input==='string'?input:input.url??input),method=init?.method??'GET';
if(headers.get('neon-connection-string')==='postgresql://fixture:isolated@ep-native.neon.tech/native_ui')return original('http://127.0.0.1:3107/sql',init);
if(['127.0.0.1','localhost'].includes(url.hostname))return original(input,init);
const state=JSON.parse(fs.readFileSync(dir+'/window-state.json')),authority=JSON.parse(fs.readFileSync(dir+'/window-authority.json'));
if(state.status!=='ACTIVE'||state.id!==authority.id||Date.now()>=Date.parse(authority.expiresAt))throw Error('Temporary qualification is unusable');
if(url.hostname==='api.github.com'&&method==='GET'&&allowedGitHub.includes(url.pathname))return original(input,init);
if(url.hostname==='ai-gateway.vercel.sh'&&method==='GET')return original(input,init);
if(url.href==='https://ai-gateway.vercel.sh/v4/ai/language-model'&&method==='POST'){
 if(headers.get('ai-language-model-id')!=='anthropic/claude-sonnet-5')throw Error('Unapproved model');
 const raw=String(init?.body??''),body=JSON.parse(raw);
 if(JSON.stringify(body.providerOptions?.gateway?.only)!==JSON.stringify(['anthropic'])||body.maxOutputTokens>2048||body.tools?.some(t=>t.name!=='engineering_direct')||Buffer.byteLength(JSON.stringify({prompt:body.prompt,tools:body.tools}))+4096>14336)throw Error('Payload exceeds approved provider/tool/input envelope');
 if(raw.includes('UNRELATED_PRIVATE_CANARY_8f329'))throw Error('Unapproved context');
 for(const value of [process.env.VERCEL_OIDC_TOKEN,process.env.MYEVE_ENGINEERING_GITHUB_TOKEN,process.env.MYEVE_SESSION_SECRET,process.env.MYEVE_ACCESS_PASSWORD])if(value&&raw.includes(value))throw Error('Credential in model payload');
 const admitted=await original('http://127.0.0.1:3107/qualification-dispatch',{method:'POST'});if(!admitted.ok)throw Error('Common budget or qualification denied dispatch');
 const hash=crypto.createHash('sha256').update(raw).digest('hex');fs.writeFileSync(dir+'/window-dispatches/payload-'+hash+'.json',raw);
 return original(input,{...init,redirect:'error'});
}
throw Error('External endpoint is outside this qualification');};