import {getVercelOidcToken} from '@vercel/oidc';
import {factoryTransport, type FactoryTransportConfiguration} from './factory-transport.ts';
export const sofieCloudProject = 'prj_XU7fJW735PtsnKoAYtGfzdnsotIB';
export const factoryOidcHeader = 'x-vercel-trusted-oidc-idp-token';
/** Request-scoped, never persisted in FactoryConnection. Vercel verifies signature
 * and trust rules; these outbound checks prevent accidental credential routing. */
export async function factoryRequestHeaders(config:FactoryTransportConfiguration,
 readToken:()=>Promise<string>=getVercelOidcToken,
 env:Readonly<Record<string,string|undefined>>=process.env):Promise<Record<string,string>> {
 const transport=factoryTransport(config);
 if(!config.transport)return transport.headers;
 try {
  if(typeof window!=='undefined'||env.VERCEL!=='1'||env.VERCEL_PROJECT_ID!==sofieCloudProject||env.VERCEL_ENV!=='preview'||(env.VERCEL_TARGET_ENV&&env.VERCEL_TARGET_ENV!=='preview'))throw Error();
  const token=await readToken();
  if(typeof token!=='string'||token.length>16384||token.split('.').length!==3)throw Error();
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
  if(claims.project_id!==sofieCloudProject||claims.owner_id!=='team_p8z8exJRTGfOPk1GC9vUOpv3'||claims.environment!=='preview'||!Number.isSafeInteger(claims.exp)||claims.exp<=Math.floor(Date.now()/1000))throw Error();
  return {...transport.headers,[factoryOidcHeader]:token};
 }catch{throw Error('FACTORY_TRUSTED_PREVIEW_IDENTITY_REQUIRED');}
}
