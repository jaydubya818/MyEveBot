import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';

const hash=value=>createHash('sha256').update(value).digest('hex');
const agentPath='apps/eve/agent/agent.ts';
const instructionsPath='apps/eve/agent/instructions/persistent-agent.ts';
export const operationSourcePreimages=Object.freeze({
 [agentPath]:'ad1d1ca8159bff6b0815ba3495b63a960250e27a727652f24914f9b22f4a1bd5',
 [instructionsPath]:'5a257752ceb18ae5beec02f799a0d41fdf30a35e10d4ab7ddca2a3ffb3d7a0cf',
});
const boundaries=Object.freeze({
 [agentPath]:Object.freeze([
  ['MODEL_SELECTION','AGENT_MODEL_RESOLVE'],
  ['MODEL_GENERATE','AGENT_MODEL_DO_GENERATE'],
  ['MODEL_STREAM','AGENT_MODEL_DO_STREAM'],
 ]),
 [instructionsPath]:Object.freeze([['INSTRUCTIONS','PERSISTENT_AGENT_TURN_STARTED']]),
});
function once(source,from,to){
 assert.equal(source.split(from).length,2,'FIXTURE_OPERATION_SEAM_CHANGED');
 return source.replace(from,to);
}
function header(companionPath){
 // Require this exact physical CJS companion, not a bundled second instance.
 // It is also required by the test preload, so console+operations share caps.
 return `import { createRequire as fixtureDiagnosticRequire } from 'node:module';
const fixtureObserveOperation = (() => {
 if (process.env.MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS === 'eve') {
  try {
   const observe = fixtureDiagnosticRequire(import.meta.url)(${JSON.stringify(companionPath)}).observeFixtureOperation;
   if (typeof observe === 'function') return observe;
  } catch {}
 }
 return <T>(_phase: string, action: () => T): T => action();
})();
`;
}

/** Ordinary opt-in fixture ONLY. No reads or mutations when disabled. All
 * preimages and one-occurrence edits are validated before any result returns.
 * Caller publishes these bodies only into its owned isolated source copy. */
export function fixtureOperationOverlay(optIn,sources,companionPath){
 if(optIn!=='1')return [];
 assert(typeof companionPath==='string'&&companionPath.length<=4096
  &&isAbsolute(companionPath)&&!companionPath.includes('\0')
  &&companionPath.endsWith('/apps/eve/test/owner-journey/fixture-error-diagnostics.cjs'),
 'FIXTURE_OPERATION_COMPANION_PATH');
 const outputs=[];
 for(const [path,sha256] of Object.entries(operationSourcePreimages)){
  const original=sources[path];
  assert.equal(typeof original,'string','FIXTURE_OPERATION_SOURCE_REQUIRED');
  assert.equal(hash(original),sha256,'FIXTURE_OPERATION_PREIMAGE_CHANGED');
  let body=original;
  if(path===agentPath){
   body=once(body,'const resolve = async () => {',
    "const resolve = async () => fixtureObserveOperation('MODEL_SELECTION', async () => {");
   body=once(body,"return typeof value==='string'?gateway(value):value; };",
    "return typeof value==='string'?gateway(value):value; });");
   for(const [method,phase] of [['doGenerate','MODEL_GENERATE'],['doStream','MODEL_STREAM']]){
    const signature=`${method}:async(options:Parameters<ReturnType<typeof gateway>['${method}']>[0])=>`;
    body=once(body,signature+`(await resolve()).${method}(options)`,
     signature+`{const selected=await resolve();return fixtureObserveOperation('${phase}',async()=>selected.${method}(options));}`);
   }
  }else{
   body=once(body,'"turn.started": async (event, ctx) => {',
    '"turn.started": async (event, ctx) => fixtureObserveOperation(\'INSTRUCTIONS\', async () => {');
   body=once(body,'    },\n  },\n});\n','    }),\n  },\n});\n');
  }
  body=header(companionPath)+body;
  outputs.push({path,body,beforeSha256:sha256,afterSha256:hash(body),
   boundaries:boundaries[path].map(([phase,provenance])=>({phase,provenance}))});
 }
 return outputs;
}
