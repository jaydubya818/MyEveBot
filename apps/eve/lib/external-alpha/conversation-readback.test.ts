import {expect,it,vi} from 'vitest';
import {canonicalConversationReply} from './conversation-readback.ts';
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
