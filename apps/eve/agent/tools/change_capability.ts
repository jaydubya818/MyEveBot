import { defineTool } from 'eve/tools';
import { always } from 'eve/tools/approval';
import { capabilityCommandSchema } from '../../lib/capability-control/contracts.ts';
import { changeOwnerCapability } from '../../lib/capability-control/sofie.ts';

export default defineTool({
  description: 'Change an owner capability preference after direct approval, using the revision returned by show_capabilities and a stable UUID requestId. Enable or disable MissionControl, MyFactory, Memory, or another registered capability independently. Disable affects new admission preference and preserves existing Work. Pause and revoke remain pending until backend acknowledgement; never report that writers have stopped from this receipt. Enabling never grants execution, spends money, or overrides Relay or backend restrictions.',
  availableInSubagents: false,
  approval: always(),
  inputSchema: capabilityCommandSchema,
  execute(input, ctx) { return changeOwnerCapability(input, ctx); },
});
