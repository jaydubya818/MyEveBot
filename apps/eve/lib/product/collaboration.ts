import type {ExecutionDatabase} from '../execution-types.ts';
/** Owner-visible transport metadata only. Encrypted payloads, private Memory,
 * credentials, capability grants and synthesized agent responses are excluded. */
export async function readCollaboration(db:ExecutionDatabase,ownerId:string){
 const [connections,requests]=await Promise.all([
  db.query(`SELECT c.local_agent_id,a.name,c.status FROM myeve_relay_connections c JOIN agents a ON a.owner_id=c.owner_id AND a.id=c.local_agent_id WHERE c.owner_id=$1`,[ownerId]),
  db.query(`SELECT request_id,direction,capability,conversation_id,sender_owner_id,sender_agent_id,state,created_at,updated_at FROM myeve_relay_requests WHERE owner_id=$1 ORDER BY updated_at DESC,request_id DESC LIMIT 50`,[ownerId]),
 ]);
 const groups=new Map<string,{id:string;correlated:boolean;updatedAt:string;requests:Array<{id:string;direction:string;capability:string;sender:string;state:string}>}>();
 for(const row of requests){
  const id=row.conversation_id?`conversation:${row.conversation_id}`:`request:${row.request_id}`;
  let conversation=groups.get(id);
  if(!conversation){conversation={id,correlated:!!row.conversation_id,updatedAt:new Date(String(row.updated_at)).toISOString(),requests:[]};groups.set(id,conversation);}
  conversation.requests.push({id:String(row.request_id),direction:String(row.direction),capability:String(row.capability),sender:`relay://${row.sender_owner_id}/${row.sender_agent_id}`,state:String(row.state)});
 }
 const connection=connections[0];
 return {connection:connection?{agentId:String(connection.local_agent_id),agentName:String(connection.name),status:String(connection.status)}:null,
  conversations:[...groups.values()].slice(0,10),groupExecutionQualified:false as const,bounds:{requests:50,conversations:10}};
}
export type CollaborationView=Awaited<ReturnType<typeof readCollaboration>>;
