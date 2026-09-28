// Controlled loopback Responses provider for the installed CLI. Never a live model.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';

export function controlledCliResponses({exerciseSearch=false}={}){
 let phase=null,index=0,target=null,original=null,searchCallId=null,searchOutputs=0;
 return {
  stats:()=>({clientSearchOutputs:searchOutputs}),
  async begin(input,contents){phase=input.sandbox==='read-only'?'completion':'productive';index=0;target=contents;original=await readFile(join(input.workspacePath,'quantity.mjs'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});},
  async respond(req,res,call){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=JSON.parse(Buffer.concat(chunks).toString());
   assert(phase);index++;
   const id='controlled-response-'+call;
   let output;
   if(phase==='productive'&&exerciseSearch&&index===1){
    assert(request.tools.some(t=>t.type==='tool_search'&&t.execution==='client'));
    searchCallId='lookup-'+call;
    output=[{type:'tool_search_call',id:'search-'+call,call_id:searchCallId,execution:'client',status:'completed',arguments:{query:'apply_patch',limit:1}}];
   }else if(phase==='productive'&&index===(exerciseSearch?2:1)){
    if(exerciseSearch){assert(request.input.some(item=>item.type==='tool_search_output'&&item.execution==='client'&&item.call_id===searchCallId),'Installed CLI must return its actual local search output');searchOutputs++;}

    const tool=request.tools.find(t=>t.name==='apply_patch');
    assert(tool, 'Installed CLI must expose apply_patch to the controlled provider');
    const patch='*** Begin Patch\n'+(original===null?'*** Add File: quantity.mjs\n':'*** Update File: quantity.mjs\n@@\n'+original.trimEnd().split('\n').map(line=>'-'+line).join('\n')+'\n')+target.trimEnd().split('\n').map(line=>'+'+line).join('\n')+'\n*** End Patch';
    output=[tool.type==='custom'?{type:'custom_tool_call',id:'tool-'+call,call_id:'call-'+call,name:'apply_patch',input:patch,status:'completed'}:{type:'function_call',id:'tool-'+call,call_id:'call-'+call,name:'apply_patch',arguments:JSON.stringify({patch}),status:'completed'}];
   }else{
    assert(index<=(phase==='productive'?(exerciseSearch?3:2):1),'Controlled plan exceeded');
    output=[{type:'message',id:'message-'+call,role:'assistant',status:'completed',content:[{type:'output_text',text:phase==='completion'?'Controlled read-only completion summary.':'Controlled fixture change complete.',annotations:[]}]}];
   }
   const response={id,object:'response',created_at:Math.floor(Date.now()/1000),status:'completed',model:request.model,output,usage:{input_tokens:10,output_tokens:10,total_tokens:20}};
   res.writeHead(200,{'content-type':'text/event-stream','x-request-id':'controlled-'+call});
   let seq=0;const event=data=>res.write('event: '+data.type+'\ndata: '+JSON.stringify({...data,sequence_number:seq++})+'\n\n');
   event({type:'response.created',response:{...response,status:'in_progress',output:[]}});
   for(const [output_index,item] of output.entries()){
    event({type:'response.output_item.added',output_index,item});
    event({type:'response.output_item.done',output_index,item});
   }
   event({type:'response.completed',response});res.end();
  }
 };
}
