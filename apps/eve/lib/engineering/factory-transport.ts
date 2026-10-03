/** Destinations are reviewed backend configuration; response URLs never choose them. */
export interface FactoryTransportConfiguration {
 origin:string;token:string;
 transport?:'CLOUD';protocol?:'MYFACTORY_EXECUTION_V2';projectId?:string;
}
export function factoryTransport(config:FactoryTransportConfiguration){
 const url=new URL(config.origin);
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!config.token.trim())throw Error('Exact configured Factory origin and backend token required');
 if(config.transport==='CLOUD'){
  if(config.protocol!=='MYFACTORY_EXECUTION_V2'||config.projectId!=='prj_IRXTY6HOzS2q9wRPdabsJnmddzl4'||url.protocol!=='https:'||url.port||!/^myfactory-cloud-staging-[a-z0-9]+-jaydubya818\.vercel\.app$/.test(url.hostname))throw Error('Exact dedicated staging Factory HTTPS contract required');
  return {origin:url,prefix:'/api/connect/v2',headers:{authorization:'Bearer '+config.token}};
 }
 if(config.protocol||config.projectId||url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('Exact configured loopback producer required');
 return {origin:url,prefix:'/api/connect/v1',headers:{authorization:'Bearer '+config.token}};
}
