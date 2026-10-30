import { authorizeRelayAction, assertRelayGrant, RelayDenied, type RelayAction, type RelayDeveloperGrant } from "./relay-grant.ts";

/**
 * Deep Agent -> Relay developer-tool boundary. Discovery shows only tools whose
 * action the grant permits; execution re-authorizes the exact action against the
 * grant BEFORE the transport is touched. The transport is injected (the real one
 * is Relay's own enforced API); this class never holds a credential.
 */
export type RelayTool = { name: string; kind: RelayAction["kind"] };
export interface RelayTransport {
  discover(): Promise<RelayTool[]>;
  execute(name: string, args: Record<string, unknown>): Promise<unknown>;
}
export type RelayCallArgs = { repository?: string; ref?: string; branch?: string; path?: string; force?: boolean };

export class RelayDeveloperTools {
  constructor(private readonly grant: RelayDeveloperGrant, private readonly transport: RelayTransport) { assertRelayGrant(grant); }

  private toAction(kind: RelayAction["kind"], a: RelayCallArgs): RelayAction {
    const repository = a.repository ?? this.grant.repository;
    if (kind === "write_contents")
      return { kind, repository, branch: a.branch ?? "", baseCommit: this.grant.baseCommit, force: a.force, path: a.path ?? "" };
    if (kind === "write_deployment" || kind === "edit_workflow" || kind === "administer_repository") return { kind, repository };
    return { kind, repository, ref: a.ref };
  }
  private permitted(tool: RelayTool): boolean {
    try {
      authorizeRelayAction(this.grant, this.toAction(tool.kind, tool.kind === "write_contents"
        ? { branch: this.grant.outputBranch, path: "src/sample.ts" } : {}));
      return true;
    } catch (error) { if (error instanceof RelayDenied) return false; throw error; }
  }
  /** Tools the grant allows; everything else is invisible to the agent. */
  async discover(): Promise<RelayTool[]> {
    return (await this.transport.discover()).filter(t => this.permitted(t));
  }
  async execute(tool: RelayTool, args: RelayCallArgs = {}): Promise<unknown> {
    authorizeRelayAction(this.grant, this.toAction(tool.kind, args));
    if (!(await this.discover()).some(t => t.name === tool.name && t.kind === tool.kind)) throw new RelayDenied("QDEV_RELAY_TOOL_NOT_DISCOVERED");
    return this.transport.execute(tool.name, { ...args, repository: this.grant.repository });
  }
}
