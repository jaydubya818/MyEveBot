import {expect,it,vi} from 'vitest';
import {canonicalConversationReply,conversationPublicationText} from './conversation-readback.ts';
const input={ownerId:'owner-a',agentId:'agent-a',sessionId:'session-a',threadId:'thread-a',turnId:'turn-a'};
it('only acknowledges the exact completed canonical tool call in this owner/session/turn',async()=>{
 const query=vi.fn().mockResolvedValue([{state:'CONSUMED'}]);
 const prompt=[{role:'tool' as const,content:[{type:'tool-result' as const,toolName:'engineering_factory',toolCallId:'call-a',output:{type:'json' as const,value:{state:'STARTED'}}}]}];
 expect(await canonicalConversationReply({query},input,prompt)).toContain('acknowledged');
 expect(query.mock.calls[0][1]).toEqual(['owner-a','agent-a','session-a','call-a','session-a:turn-a']);
 query.mockResolvedValue([]);expect(await canonicalConversationReply({query},input,prompt)).toBeNull();
});
it('never swallows a compound message, non-text input or unbound readback',async()=>{
 const query=vi.fn();
 for(const content of [[{type:'text',text:'What did you change?'},{type:'text',text:'Also start another Work'}],[{type:'text',text:'What did you change?'},{type:'file',mediaType:'text/plain',data:'x'}],[{type:'text',text:'Start new Work'}]])
  expect(await canonicalConversationReply({query},input,[{role:'user',content}] as any)).toBeNull();
 expect(await canonicalConversationReply({query},{...input,threadId:undefined},[{role:'user',content:[{type:'text',text:'What did you change?'}]}])).toBeNull();expect(query).not.toHaveBeenCalled();
});
it('does not select another Work when conversation evidence is absent or ambiguous',async()=>{
 const query=vi.fn();for(const rows of [[],[{id:'one'},{id:'two'}]]){query.mockResolvedValue(rows);expect(await canonicalConversationReply({query},input,[{role:'user',content:[{type:'text',text:'What did you change?'}]}])).toBeNull();}
 expect(query.mock.calls[0][1]).toEqual(['owner-a','agent-a','session-a','thread-a']);
});

it('counterfactual publication readback binds the exact owner, Work, Result, revision and candidate',()=>{
 const id="00000000-0000-4000-8000-000000000001",candidate="a".repeat(40),tree="b".repeat(40),base="c".repeat(40);
 const binding={owner:"owner-a",workId:id,resultId:id,resultHash:"proof-a",version:1,generation:1,candidate,verifiedTree:tree,repository:"synthetic/alpha-tasks",baseRef:"main",expectedBaseSha:base,branch:`codex/factory/wo-${id}`,receiptId:id,profileHash:"profile-a",allowedPaths:["src/app.ts"],title:"Priority",body:"",publicationReady:true,ownerAcceptance:"NOT_RUN"} as const;
 const expected={owner:binding.owner,workId:id,resultId:id,resultHash:"proof-a",version:1,generation:1,candidate};
 const readback={binding,observedAt:new Date().toISOString(),branchCount:1,prCount:1,candidate,tree,baseRef:"main",baseSha:base,prNumber:1,prUrl:"https://github.com/synthetic/alpha-tasks/pull/1",draft:true,merged:false,files:["src/app.ts"],ci:{status:"PASS",workflow:"synthetic",candidate,runId:"fixture",url:"https://example.invalid/run",checks:[{name:"checks",candidate,result:"PASS"}]},review:{status:"PASS",candidate,reviewer:"synthetic independent reviewer",mode:"INDEPENDENT_READ_ONLY",reportHash:"d".repeat(64),summary:"Fixture",testsPassed:10,findings:[],limitations:[]},ownerAcceptance:"NOT_RUN",merge:"NOT_RUN",deployment:"NOT_RUN"};
 const row={state:"PR_OPEN",remote:{readbacks:[readback]}};
 expect(conversationPublicationText(undefined,expected)).toBe("Nothing was published.");
 expect(conversationPublicationText(row,expected)).toContain(readback.prUrl);
 for(const changed of [{owner:"owner-b"},{workId:"00000000-0000-4000-8000-000000000002"},{resultHash:"changed"},{version:2},{candidate:"e".repeat(40)}]){
  const text=conversationPublicationText(row,{...expected,...changed});
  expect(text).toContain("not confirmed");expect(text).not.toContain("Nothing was published");
 }
 expect(conversationPublicationText({state:"PR_OPEN",remote:{readbacks:[]}},expected)).toContain("not confirmed");
});
