import assert from 'node:assert/strict';

const diagnostic=(phase,outcome,elapsed='Math.round(performance.now()-started)')=>`
    try {
      const codes=['ENTERPRISE_RESPONSE_UNAVAILABLE','ENTERPRISE_RESPONSE_TOO_LARGE','ENTERPRISE_COMMAND_DENIED',
        'ENTERPRISE_RESPONSE_BINDING','ENTERPRISE_RESULT_AUTHENTICATION','ENTERPRISE_RESULT_BINDING',
        'ENTERPRISE_RESULT_REQUEST_MISMATCH','ENTERPRISE_PROPOSAL_BINDING','ENTERPRISE_MISSION_BINDING'];
      ${outcome==='PASS'?"const code='NONE';":`
      const message=error instanceof Error?error.message:undefined;
      const name=error instanceof Error?error.name:undefined;
      const databaseCode=error instanceof Error && 'code' in error?error.code:undefined;
      const actionStatus=error instanceof Error && 'status' in error?error.status:undefined;
      const messageCode=codes.find(value=>value===message);
      const nameCode=['AbortError','TimeoutError','ZodError','TypeError','SyntaxError'].find(value=>value===name);
      const postgresCode=['23505','23514','23503','23502','42P01','42703','57P01','53300','57014','40001','40P01'].find(value=>value===databaseCode);
      const statusCode=['denied','awaiting_approval','result_unknown'].find(value=>value===actionStatus);
      const code=messageCode??nameCode??(postgresCode?'POSTGRES_'+postgresCode:statusCode?'ACTION_'+statusCode.toUpperCase():'UNCLASSIFIED');`}
      console.error('[enterprise-fixture-diagnostic] '+JSON.stringify({phase:${phase},outcome:'${outcome}',code,elapsedMs:${elapsed}}));
    } catch {}
`;

// Applied only to the disposable browser fixture, never the production consumer.
export function instrumentEnterpriseResponseFailure(source) {
  const boundary="if(body.status!=='success')throw Error('ENTERPRISE_COMMAND_DENIED');";
  assert.equal(source.split(boundary).length,2,'Exactly one canonical response denial is required');
  return source.replace(boundary,`if(body.status!=='success') {
    try {
      const message=body.errorMessage;
      const code=typeof message==='string' && message.split('\\n').some(line=>line==='Function execution timed out (maximum duration: 1s)')
        ? 'CONVEX_FUNCTION_TIMEOUT_1S'
        : ['ENTERPRISE_ACCESS_DENIED','ENTERPRISE_PLAN_STALE'].find(value=>value===message)??'UNCLASSIFIED_BACKEND_ERROR';
      console.error('[enterprise-fixture-diagnostic] '+JSON.stringify({phase:'canonicalResponse',outcome:'FAIL',code,elapsedMs:null}));
    } catch {}
    throw Error('ENTERPRISE_COMMAND_DENIED');
  }`);
}

export function instrumentEnterpriseConsumer(source) {
  const declaration='export async function sendEnterpriseCommand(';
  assert.equal(source.split(declaration).length,2,'Exactly one canonical command export is required');
  assert.equal(source.includes('fixtureSendEnterpriseCommand'),false,'Diagnostic overlay must not be applied twice');
  return source.replace(declaration,'async function fixtureSendEnterpriseCommand(')+`
export async function sendEnterpriseCommand(...args: Parameters<typeof fixtureSendEnterpriseCommand>) {
  const started=performance.now();
  try { return await fixtureSendEnterpriseCommand(...args); }
  catch(error) {
    // Error messages may contain provider data or credentials. Emit only known codes.
    ${diagnostic("'sendEnterpriseCommand'",'FAIL')}
    throw error;
  }
}
`;
}

export function instrumentEnterpriseAdapter(source) {
  const declaration='export function enterpriseAdapter(';
  assert.equal(source.split(declaration).length,2,'Exactly one canonical adapter export is required');
  assert.equal(source.includes('fixtureEnterpriseAdapter'),false,'Diagnostic overlay must not be applied twice');
  return source.replace(declaration,'function fixtureEnterpriseAdapter(')+`
export function enterpriseAdapter(...args: Parameters<typeof fixtureEnterpriseAdapter>) {
  const adapter=fixtureEnterpriseAdapter(...args);
  ${['execute','verify'].map(phase=>`{
    const original=adapter.${phase};
    if(Object.prototype.toString.call(original)!=='[object AsyncFunction]')throw Error('FIXTURE_ADAPTER_ASYNC_CONTRACT_REQUIRED');
    adapter.${phase}=async function(this: typeof adapter,...parameters: Parameters<typeof original>) {
      const started=performance.now();
      try {
        const result=await original.apply(this,parameters);
        ${diagnostic(JSON.stringify('adapter.'+phase),'PASS')}
        return result;
      } catch(error) {
        ${diagnostic(JSON.stringify('adapter.'+phase),'FAIL')}
        throw error;
      }
    };
  }`).join('\n')}
  return adapter;
}
`;
}

export function instrumentActionGateway(source) {
  const boundary='    } catch {\n      await this.record(action.ownerId,actionId,"result_unknown",{});';
  assert.equal(source.split(boundary).length,2,'Exactly one swallowing gateway boundary is required');
  return source.replace(boundary,'    } catch(error) {\n'+diagnostic("'ActionGateway.run'",'FAIL','null')+'      await this.record(action.ownerId,actionId,"result_unknown",{});');
}
