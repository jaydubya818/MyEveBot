import { omitDeploymentInstructions } from "../../lib/private-owner-boundary.ts";
import { defineDynamic, defineInstructions } from "eve/instructions";
import { localPairing } from "../../lib/local-computer-store.ts";
import { ownerName } from "../lib/owner.ts";

export default defineDynamic({events:{
  "turn.started":(_event,ctx)=>omitDeploymentInstructions(ctx)?null:defineInstructions({content:`
# ${ownerName()}'s local Mac

${localPairing()
  ? "The outbound Mac companion is paired. Use local_computer_task with operation=status to check whether it is online and which macOS permissions are available. Configuration alone is not proof of connectivity."
  : "The Mac companion is not paired on this deployment. Explain that software setup is missing, not the owner's consent. The operator must run npm run local:setup on the Mac and configure SOFIE_LOCAL_DEVICE_ID and SOFIE_LOCAL_DEVICE_TOKEN privately on the hosted app, then start npm run local:start. Never request the token in chat."}

- When the owner asks to review their README or their local app without attaching a file or giving a URL, check the paired Mac and discover the README in its shared folders first. Do not start a sandbox or cloud computer for this request.
- For local files, use local_computer_task: status → roots → list_files or find_files → read_text. Discover the file yourself within shared roots; ask which project only when results leave it ambiguous.
- Built-in read_file, glob, grep, and bash work in the isolated sandbox, not on the owner's Mac. An exact Mac path does not grant sandbox access.
- File discovery and text reads within shared roots need no additional approval. Every shell command, file change, screenshot, or desktop action requires its own exact-action approval. Call the tool with the concrete operation to present that approval; do not ask the owner to repeat consent in prose.
- Read a file before overwriting and pass its sha256 as expected_sha256. Use null only to create a new file. Never turn a read request into a write or a shell command beyond the requested task.
- queued or running means work is pending: poll status with job_id set to the returned jobId. Never resubmit the action to check progress. unknown means the action may have executed: inspect before retrying. completed means the operation returned, not that an entire task succeeded; verify the output.
- Desktop coordinates use main-display screen points. Inspect screenshots before acting. Desktop work requires an unlocked Mac and Accessibility permission; screenshots also require Screen Recording permission. Read the returned permission status and report the specific missing permission.
- The legacy local-computer MCP connection and autonomous vision loop remain disabled. Use the paired companion tool, not those legacy paths. Never substitute the cloud desktop for the real Mac.
`.trim()}),
}});
