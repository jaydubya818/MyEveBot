import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({run:vi.fn(),agent:vi.fn(),identity:vi.fn()}));
vi.mock('./action-context.ts',()=>({ownerChatRun:mocks.run}));
vi.mock('./session-settings.ts',()=>({resolveSessionAgent:mocks.agent}));
vi.mock('../../lib/execution-auth.ts',()=>({executionIdentityFromAuth:mocks.identity}));
import hook from '../hooks/owner-chat-run.ts';
const ctx:any={session:{id:'same-conversation',auth:{current:{principalId:'owner',principalType:'user',attributes:{owner:'true'}}}}};
const receive=(message:string,context=ctx)=>hook.events!['message.received']!({data:{message}} as any,context);
beforeEach(()=>{vi.resetAllMocks();mocks.agent.mockResolvedValue({id:'agent'});mocks.run.mockResolvedValue('fresh-run');});
describe('owner-chat Run recovery',()=>{
 it('recovers only on new input while preserving session identity',async()=>{await receive('Ask Atlas about research');expect(mocks.run).toHaveBeenCalledWith({ownerId:'owner',sessionId:'same-conversation',agentId:'agent',recover:true,initialize:false});});
 it.each(['yes','YES.','no','approve','approved','deny','ok','okay',''])('does not turn confirmation %s into fresh authority',async(text)=>{await receive(text);expect(mocks.run).not.toHaveBeenCalled();});
 it('does not reparent routine or delegated authority',async()=>{mocks.identity.mockReturnValue({id:'occurrence'});await receive('new work');expect(mocks.run).not.toHaveBeenCalled();mocks.identity.mockReturnValue(null);await receive('new work',{...ctx,session:{...ctx.session,parent:{}}});expect(mocks.run).not.toHaveBeenCalled();});
 it('fails closed when fresh execution context cannot be established',async()=>{mocks.run.mockRejectedValue(new Error('RUN_CREATION_FAILED'));await expect(receive('new work')).rejects.toThrow('RUN_CREATION_FAILED');});
});
