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
