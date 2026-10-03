"use client";
import Link from 'next/link';
import type {CollaborationView} from '@/lib/product/collaboration';
import {useProductResource} from './resource';
import {ResourceState} from './product-shell';
import {Card,Empty,date} from './primitives';
const statuses:Record<string,string>={incoming:'Received',processing:'In progress',needs_approval:'Needs your approval',accepted:'Accepted',completed:'Response recorded',denied:'Declined',expired:'Expired',recovery_required:'Needs verification'};
export function CollaborationActivity(){
 const source=useProductResource<CollaborationView>('/api/collaboration');
 return <Card title="Recent agent handoffs"><div data-collaboration>
  <ResourceState {...source}/>
  {source.data&&<>
   <p>{source.data.connection?`${source.data.connection.agentName} · Relay connection ${source.data.connection.status}`:'No Relay connection recorded.'}</p>
   <ul className="owner-list">{source.data.conversations.map(conversation=><li key={conversation.id}>
    <h3>{conversation.correlated?'Agent conversation':'Individual request'}</h3>
    <p>{conversation.requests.length} retained {conversation.requests.length===1?'request':'requests'} · {date(conversation.updatedAt)}</p>
    <p>{statuses[conversation.requests[0].state]??'Status unavailable'}</p>
    <details><summary>Proof of handoff</summary>
     <p>Correlation: <code>{conversation.id}</code></p>
     <ul>{conversation.requests.map(request=><li key={request.id}><p>{request.direction==='incoming'?'Received':'Sent'} · {request.capability} · {statuses[request.state]??'Status unavailable'}</p><p>Sender: <code>{request.sender}</code></p><p>Request: <code>{request.id}</code></p></li>)}</ul>
     <p>Transport records do not prove productive execution, a verified Result or Group membership.</p>
    </details>
   </li>)}</ul>
   {!source.data.conversations.length&&<Empty title="No handoffs recorded">Only retained Relay requests appear here.</Empty>}
   <p className="owner-muted">Up to 10 conversations from the latest 50 requests. Private message bodies and Memory are not included.</p>
  </>}
  <div className="owner-actions"><button onClick={source.refresh}>Refresh handoffs</button><Link href="/manage/peers">Review Relay connections</Link></div>
 </div></Card>;
}
