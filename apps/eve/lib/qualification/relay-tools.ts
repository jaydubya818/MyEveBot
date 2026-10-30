import { authorizeRelayAction, assertRelayGrant, RelayDenied, type RelayAction, type RelayDeveloperGrant } from "./relay-grant.ts";
import { CANONICAL_RELAY_CONTRACT, type RelayToolContract, type RelayToolSpec } from "./relay-tool-contract.ts";

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
export type RelayCallArgs = Record<string, unknown>;

export class RelayDeveloperTools {
  constructor(private readonly grant: RelayDeveloperGrant, private readonly transport: RelayTransport,
    private readonly contract: RelayToolContract = CANONICAL_RELAY_CONTRACT) { assertRelayGrant(grant); }

  private spec(tool: RelayTool): RelayToolSpec {
    const spec = Object.hasOwn(this.contract, tool.name) ? this.contract[tool.name] : undefined;
    if (!spec || spec.kind !== tool.kind) throw new RelayDenied("QDEV_RELAY_TOOL_UNSUPPORTED");
    return spec;
  }
  private permitted(tool: RelayTool): boolean {
    try {
      const spec = this.spec(tool);
      authorizeRelayAction(this.grant, spec.action(this.grant, spec.input.parse(spec.sample)));
      return true;
    } catch (error) { if (error instanceof RelayDenied) return false; throw error; }
  }
  /** Tools that are in the supported contract AND whose action the grant allows; everything else is invisible. */
  async discover(): Promise<RelayTool[]> {
    return (await this.transport.discover()).filter(t => this.permitted(t));
  }
  async execute(tool: RelayTool, args: RelayCallArgs = {}): Promise<unknown> {
    const spec = this.spec(tool);
    // Strict, tool-specific input: unknown keys (owner, repo, repository, aliases) are denied, never forwarded.
    const parsed = spec.input.safeParse(args);
    if (!parsed.success) throw new RelayDenied("QDEV_RELAY_INPUT_DENIED");
    authorizeRelayAction(this.grant, spec.action(this.grant, parsed.data));
    if (!(await this.discover()).some(t => t.name === tool.name && t.kind === tool.kind)) throw new RelayDenied("QDEV_RELAY_TOOL_NOT_DISCOVERED");
    return this.transport.execute(tool.name, spec.native(this.grant, parsed.data));
  }
}
