import {createServer} from 'node:http';
/** Bind behind authenticated HTTPS ingress. Body and wall-clock bounds apply to
 * control-plane traffic independently of the provider-attempt budget. */
export function serve(controller,{host='127.0.0.1',port=0,workerName,sourceSha}={}){
 const server=createServer(async(req,res)=>{
  try{
   if(req.method==='GET'&&req.url==='/health'){await controller.authority.assertRunning();if(workerName)await controller.active({name:workerName,...controller.principals[workerName]});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({healthy:true,sha:sourceSha}));return;}
   if(req.method!=='POST'||!/^\/(job-submit|job-take|job-result|job-complete|active|heartbeat|claim|http|artifact|model|disable-model|stop|provider-admit|provider-claim|provider-complete|signing-admit|signing-claim)$/.test(req.url??''))throw Error();
   const parts=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>600000)throw Error();parts.push(chunk);}
   const input=JSON.parse(Buffer.concat(parts).toString());if(input.session!==controller.authority.id)throw Error();
   const result=await controller.dispatch(req.headers.authorization,req.url.slice(1),input);
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));
  }catch{res.writeHead(403,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"QUALIFICATION_DENIED"}');}
 });server.requestTimeout=20000;server.headersTimeout=5000;server.maxConnections=32;server.listen(port,host);return server;
}
