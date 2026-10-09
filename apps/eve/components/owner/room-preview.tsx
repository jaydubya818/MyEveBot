"use client";
import {useState} from 'react';
import type {AgentGroup} from '@/lib/product/groups';
import {Card} from './primitives';
// Presentation fixture only. Production Rooms must use the persisted Group
// adapter, authorized references and canonical Relay receipts, not this data.
const group:AgentGroup={id:'preview-design-room',ownerId:'fixture-owner',name:'A clearer owner review',objective:'Make the review experience easier to understand without changing publication authority.',version:1,members:[{agentId:'Sofie',role:'coordinator'},{agentId:'Designer',role:'member'},{agentId:'Software Engineer',role:'member'},{agentId:'Reviewer',role:'reviewer'}],links:[{kind:'result',id:'Design recommendation',revision:'fixture-v1',agentId:'Designer'},{kind:'work',id:'Implement the review layout',revision:'fixture-v1',agentId:'Software Engineer'},{kind:'artifact',id:'Desktop and mobile review evidence',revision:'fixture-v1',agentId:'Reviewer'}],handoffs:[],attentionId:'fixture-owner-decision'};
const tabs=['Conversation','Work','Results','Artifacts','Needs You'] as const;
export function RoomPreview(){
 const [tab,setTab]=useState<(typeof tabs)[number]>('Conversation');
 return <section id="room-preview" aria-label="Room interaction preview" data-room-preview>
  <Card title={group.name}><p className="owner-eyebrow">Room · sample data only</p><p>{group.objective}</p><p className="owner-muted">Members: {group.members.map(m=>m.agentId).join(' · ')}</p>
   <div role="group" aria-label="Room sections" className="owner-actions">{tabs.map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
   <div className="owner-room-canvas" aria-live="polite">
    {tab==='Conversation'?<><h3>Sofie is coordinating</h3><p><strong>Designer</strong> · The design recommendation is ready for the engineer.</p><p><strong>Software Engineer</strong> · Implementation is ready for visual review.</p><p><strong>Reviewer</strong> · Desktop and mobile evidence is ready.</p><p><strong>Sofie</strong> · Review the Result and choose the next step.</p></>:tab==='Needs You'?<><h3>Review the Result</h3><p>A real Room will surface the existing Work decision here. Publication choices retain their exact candidate and approval boundary.</p><a href="/work-canvas">Explore the owner-decision preview</a></>:<><h3>{tab}</h3><ul>{group.links.filter(r=>r.kind===(tab==='Work'?'work':tab==='Results'?'result':'artifact')).map(r=><li key={r.id}>{r.id} · {r.agentId}</li>)}</ul></>}
   </div>
   <p className="owner-muted">Interaction preview only. No messages sent, Work dispatched, access granted or decisions recorded.</p>
   <details><summary>Proof of collaboration</summary><p>This layout consumes Group members and authorized Work/Result/artifact references. Relay supplies actual conversation and handoff evidence. Production membership, identity and shared-schema integration remain pending.</p></details>
  </Card>
 </section>;
}
