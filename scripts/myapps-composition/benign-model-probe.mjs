import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const FOLLOWUP='Repeat my runtime packaging marker in one sentence.';
function text(message){
 if(typeof message.content==='string')return message.content;
 assert(Array.isArray(message.content),'BENIGN_MODEL_CONTENT');
 return message.content.filter(part=>part.type==='text').map(part=>part.text).join('');
}

/** A two-call namespace for the CURRENT artifact's isolated public-client probe.
 * Insert before (without changing) the existing positive Work fixture dispatch.
 * Ordinary Work prompts return null and do not touch this probe's counters.
 * This is deterministic test output, never a real-provider behavior proof.
 */
export function createBenignModelProbe(marker){
 assert.match(marker,/^CURRENT_RUNTIME_[a-f0-9]{32}$/,'BENIGN_MODEL_MARKER');
 const first=`Remember this runtime packaging marker: ${marker}. Reply in one sentence.`;
 const requests=[];let calls=0;
 return {
  replyFor(prompt){
   assert(Array.isArray(prompt),'BENIGN_MODEL_PROMPT');
   const users=prompt.filter(message=>message.role==='user').map(text),last=users.at(-1)??'';
   if(!last.includes('runtime packaging marker')&&!users.includes(first))return null;
   assert(calls<2,'BENIGN_MODEL_CALL_LIMIT');
   const expected=calls===0?first:FOLLOWUP;
   assert.equal(last,expected,'BENIGN_MODEL_EXACT_REQUEST');
   if(calls===1)assert(users.includes(first),'BENIGN_MODEL_CONTEXT_LOST');
   const reply=calls===0?`Runtime packaging marker ${marker}.`:`Your runtime packaging marker is ${marker}.`;
   requests.push({index:calls+1,promptSha256:hash(prompt),replySha256:hash(reply)});calls++;
   return reply;
  },
  snapshot(){return {kind:'DETERMINISTIC_CURRENT_RUNTIME_PROBE_ONLY',calls,requests:requests.map(value=>({...value}))};},
 };
}
