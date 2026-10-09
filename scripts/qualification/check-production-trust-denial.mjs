// Explicit hosted Preview build probe. Never a production build/request hook.
// The alternate qualification config invokes this; normal builds do not.
const sourceProject='prj_L6faw25wnFGUZtrLKBIccg8gIDLR';
const team='team_p8z8exJRTGfOPk1GC9vUOpv3';
try {
 if(process.env.VERCEL!=='1'||process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_PROJECT_ID!==sourceProject)throw Error();
 const token=process.env.VERCEL_OIDC_TOKEN;
 if(!token||token.length>16384||token.split('.').length!==3)throw Error();
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
 if(claims.project_id!==sourceProject||claims.owner_id!==team||claims.environment!=='preview'||!Number.isSafeInteger(claims.exp)||claims.exp<=Date.now()/1000)throw Error();
 const response=await fetch('https://myfactory-cloud-production.vercel.app/api/readiness',{headers:{'x-vercel-trusted-oidc-idp-token':token},redirect:'manual',signal:AbortSignal.timeout(15000)});
 const denied=response.status===403&&response.headers.get('x-vercel-error')==='TRUSTED_SOURCES_ENVIRONMENT_MISMATCH';
 await response.body?.cancel();
 if(!denied)throw Error();
 console.log(JSON.stringify({check:'production-trust-preview-denial',status:'PASS',sourceProject,sourceEnvironment:'preview',destinationProject:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK',destinationEnvironment:'production',httpStatus:403,denial:'TRUSTED_SOURCES_ENVIRONMENT_MISMATCH',applicationCredentialSent:false,workCreated:false,modelOperations:0,tokenPersisted:false}));
} catch {
 console.error('Production trust Preview denial NOT_QUALIFIED. Credential and provider response details withheld.');
 process.exitCode=1;
}
