import {createServer} from 'node:http';
/** Bind behind authenticated HTTPS ingress. Body and wall-clock bounds apply to
 * control-plane traffic independently of the provider-attempt budget. */
export function serve(controller,{host='127.0.0.1',port=0}={}){
 const server=createServer(async(req,res)=>{
  try{
   if(req.method!=='POST'||!/^\/(heartbeat|claim|http|artifact|model|stop)$/.test(req.url??''))throw Error();
   const parts=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>400000)throw Error();parts.push(chunk);}
   const result=await controller.dispatch(req.headers.authorization,req.url.slice(1),JSON.parse(Buffer.concat(parts).toString()));
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));
  }catch{res.writeHead(403,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"QUALIFICATION_DENIED"}');}
 });server.requestTimeout=20000;server.headersTimeout=5000;server.maxConnections=8;server.listen(port,host);return server;
}
