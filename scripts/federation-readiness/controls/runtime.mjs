import {createRequire} from 'node:module';
import {Authority} from './postgres.mjs';
import {Controller} from './controller.mjs';
import {haikuQualificationModel} from './model.mjs';
import {serve} from './server.mjs';
/** Only the Relay supervisor parent receives controller/provider credentials.
 * Sessions/schema are installed by the operator before deployment, never here. */
export async function startController({cwd=process.cwd(),environment=process.env}={}){
 const {Pool}=createRequire(`${cwd}/package.json`)('pg');
 const pool=new Pool({connectionString:environment.FQ_CONTROL_DATABASE_URL,max:8,connectionTimeoutMillis:2000});
 try{
  const authority=new Authority(pool,environment.FQ_SESSION_ID);
  await authority.assertRunning();
  const configuration=JSON.parse(environment.FQ_CONTROLLER_CONFIG??'null');
  if(!configuration||Object.keys(configuration.principals??{}).length!==7)throw Error('FROZEN_PRINCIPALS_REQUIRED');
  const model=haikuQualificationModel({authority,credential:environment.ANTHROPIC_API_KEY,pricingReviewedUntil:Number(environment.FQ_PRICING_REVIEWED_UNTIL)});
  const controller=new Controller(authority,{...configuration,model,ingressSecrets:JSON.parse(environment.FQ_INGRESS_SECRETS??'{}')});
  const server=serve(controller,{host:'0.0.0.0',port:Number(environment.PORT??8080),workerName:'relay',sourceSha:environment.FQ_SOURCE_SHA});
  return {controller,async close(){await authority.stop().catch(()=>{});model.disable();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();}};
 }catch(error){await pool.end();throw error;}
}
