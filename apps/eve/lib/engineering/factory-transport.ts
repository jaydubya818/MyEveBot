import {HOSTED_PROFILE,mailboxFetch,type MailboxBinding,type MailboxDb,type MailboxTarget} from './factory-mailbox.ts';
/** Destinations are reviewed backend configuration; response URLs never choose them. */
export interface FactoryTransportConfiguration {
 origin:string;token:string;
 transport?:'CLOUD';protocol?:'MYFACTORY_EXECUTION_V2';projectId?:string;releaseValidation?:true;productionCanary?:true;
}
export function factoryTransport(config:FactoryTransportConfiguration){
 const url=new URL(config.origin);
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!config.token.trim())throw Error('Exact configured Factory origin and backend token required');
 if(config.transport==='CLOUD'){
  const staging=config.projectId==='prj_IRXTY6HOzS2q9wRPdabsJnmddzl4'&&/^myfactory-cloud-staging-[a-z0-9]+-jaydubya818\.vercel\.app$/.test(url.hostname);
  const production=config.projectId==='prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK'&&(url.hostname==='myfactory-cloud-production.vercel.app'||/^myfactory-cloud-production-[a-z0-9]+-jaydubya818\.vercel\.app$/.test(url.hostname));
  if(config.protocol!=='MYFACTORY_EXECUTION_V2'||(!staging&&!production)||url.protocol!=='https:'||url.port)throw Error('Exact dedicated Factory HTTPS contract required');
  if((config.releaseValidation||config.productionCanary)&&(!production||config.releaseValidation&&config.productionCanary))throw Error('Production validation destination required');
  return {origin:url,prefix:config.releaseValidation?'/api/connect/v2/release-validation':config.productionCanary?'/api/connect/v2/production-canary':'/api/connect/v2',headers:{authorization:'Bearer '+config.token}};
 }
 if(config.protocol||config.projectId||url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('Exact configured loopback producer required');
 return {origin:url,prefix:'/api/connect/v1',headers:{authorization:'Bearer '+config.token}};
}

/**
 * How the request bytes reach the configured loopback Factory host. `loopback` (owner-local and every existing profile, unchanged) is a direct
 * fetch. `mailbox` is the hosted private-beta transport: hosted MyEve cannot reach the Mac, so the same request is carried through the
 * outbound-only mailbox (factory-mailbox.ts) to the Mac poller, which forwards it to this exact origin. It is selectable only for the hosted
 * profile and only for a loopback connection (a CLOUD connection already has its own HTTPS transport); the origin, token and every
 * end-to-end check of the Factory protocol are unchanged.
 */
export type FactoryTransportOption =
 | {kind:'loopback'}
 | {kind:'mailbox';profile:typeof HOSTED_PROFILE;db:MailboxDb;binding:MailboxBinding;target?:MailboxTarget;timeoutMs?:number};
export function factoryTransportFetch(config:FactoryTransportConfiguration,option:FactoryTransportOption,direct:typeof fetch=fetch):typeof fetch{
 const transport=factoryTransport(config);
 if(option.kind==='loopback')return direct;
 if(option.kind!=='mailbox'||option.profile!==HOSTED_PROFILE||config.transport)throw Error('FACTORY_MAILBOX_HOSTED_PROFILE_REQUIRED');
 return mailboxFetch(option.db,option.binding,option.target??'factory',transport.origin.origin,{timeoutMs:option.timeoutMs});
}
