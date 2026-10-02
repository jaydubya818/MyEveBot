"use client";
import type {AgentView} from '@/lib/agents';
import {LiveAgentTile} from '../live-agent-card';
import {useProductResource} from './resource';
import {ResourceState} from './product-shell';
import {Card} from './primitives';
export function AgentOverview(){
 const source=useProductResource<{agents:AgentView[]}>('/api/agents');
 return <Card title="Agents"><ResourceState {...source}/><div className="owner-grid">{source.data?.agents?.slice(0,4).map(agent=><LiveAgentTile key={agent.id} agentId={agent.id}/>)}</div>{!source.loading&&!source.error&&!source.data?.agents?.length&&<p>No agents to show yet.</p>}<a href="/team">View all agents and responsibilities</a></Card>;
}
