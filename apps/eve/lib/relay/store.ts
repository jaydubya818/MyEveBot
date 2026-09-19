import { randomUUID } from "node:crypto";
import { db } from "../../agent/lib/receipts-db.ts";
import {
  decryptSecret,
  requestDigest,
  encryptSecret,
  type Envelope,
  type RelayIdentity,
} from "./transport.ts";
import type { PublishedReader, PublishedRecord } from "./projection.ts";

export interface Database {
  query(sql: string, params?: any[]): Promise<any[]>;
}
export interface Connection extends RelayIdentity {
  localOwnerId: string;
  localAgentId: string;
  credential: string;
  ownerSession: string;
  localWorkPolicy: Record<string, "accept" | "reject" | "approval">;
}
export class FederationStore {
  constructor(
    readonly ownerId: string,
    readonly database: Database = db() as Database,
  ) {}
  async connection(): Promise<Connection> {
    const [row] = await this.database.query(
      "SELECT * FROM myeve_relay_connections WHERE owner_id=$1 AND status='active'",
      [this.ownerId],
    );
    if (!row) throw new Error("Connect Relay first.");
    return {
      localOwnerId: this.ownerId,
      localAgentId: row.local_agent_id,
      issuer: row.issuer,
      address: row.address,
      ownerId: row.relay_owner_id,
      agentId: row.relay_agent_id,
      keyId: row.signing_key_id,
      publicKey: row.signing_public_key,
      credential: decryptSecret(this.ownerId, row.agent_credential_encrypted),
      ownerSession: decryptSecret(this.ownerId, row.owner_session_encrypted),
      localWorkPolicy: row.local_work_policy,
    };
  }
  async activity(
    kind: string,
    requestId: string | null,
    metadata: Record<string, unknown>,
  ) {
    await this.database.query(
      "INSERT INTO myeve_relay_activity(id,owner_id,request_id,kind,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",
      [
        `relay_event_${randomUUID()}`,
        this.ownerId,
        requestId,
        kind,
        JSON.stringify(metadata),
      ],
    );
  }
  async claim(envelope: Envelope) {
    // Unique request identity is permanent even after bounded content is purged.
    const rows = await this.database.query(
      `INSERT INTO myeve_relay_requests(owner_id,request_id,direction,capability,conversation_id,sender_owner_id,sender_agent_id,envelope_hash,envelope_encrypted,expires_at)
      VALUES($1,$2,'incoming',$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(owner_id,request_id) DO NOTHING RETURNING request_id`,
      [
        this.ownerId,
        envelope.id,
        envelope.capability,
        envelope.conversationId ?? null,
        envelope.caller.ownerId,
        envelope.caller.agentId,
        requestDigest(envelope),
        encryptSecret(this.ownerId, envelope),
        envelope.expiresAt,
      ],
    );
    const [row] = await this.database.query(
      "SELECT * FROM myeve_relay_requests WHERE owner_id=$1 AND request_id=$2",
      [this.ownerId, envelope.id],
    );
    if (!row || row.envelope_hash !== requestDigest(envelope))
      throw new Error("Replayed request changed its content.");
    return { fresh: rows.length === 1, row };
  }
  async begin(requestId: string) {
    const rows = await this.database.query(
      "UPDATE myeve_relay_requests SET state='processing',updated_at=now() WHERE owner_id=$1 AND request_id=$2 AND state IN ('incoming','accepted') AND expires_at>now() RETURNING *",
      [this.ownerId, requestId],
    );
    return rows[0] ?? null;
  }
  async finish(
    requestId: string,
    state: "completed" | "denied" | "needs_approval",
    result: unknown,
    decision: string,
  ) {
    await this.database.query(
      "UPDATE myeve_relay_requests SET state=$3,result_encrypted=$4,local_decision=$5,updated_at=now() WHERE owner_id=$1 AND request_id=$2 AND state='processing'",
      [
        this.ownerId,
        requestId,
        state,
        encryptSecret(this.ownerId, result),
        decision,
      ],
    );
    await this.activity("local-decision", requestId, { state, decision });
  }
  async purge() {
    await this.database.query(
      "UPDATE myeve_relay_requests SET envelope_encrypted=NULL,result_encrypted=NULL,state=CASE WHEN state IN ('completed','denied') THEN state ELSE 'expired' END WHERE owner_id=$1 AND expires_at<=now()",
      [this.ownerId],
    );
    await this.database.query(
      "DELETE FROM myeve_relay_external_context WHERE owner_id=$1 AND expires_at<=now()",
      [this.ownerId],
    );
    await this.database.query(
      "DELETE FROM myeve_relay_artifacts WHERE owner_id=$1 AND expires_at<=now()",
      [this.ownerId],
    );
  }
  publishedReader(): PublishedReader {
    // The capability exposes one exact-reference read, never SQL or arbitrary search.
    return Object.freeze({
      read: async (
        input: Parameters<PublishedReader["read"]>[0],
      ): Promise<PublishedRecord | null> => {
        const rows = await this.database.query(
          `SELECT p.record FROM myeve_relay_projection p JOIN myeve_relay_publications v ON v.id=p.publication_id AND v.owner_id=p.owner_id
        WHERE p.owner_id=$1 AND v.relay_view_id=$2 AND v.version=$3 AND p.reference=$4 AND p.revision=$5
          AND v.status='active' AND v.visibility<>'PRIVATE' AND v.expires_at>now()
          AND (v.visibility='PUBLIC' OR EXISTS(SELECT 1 FROM jsonb_array_elements(v.audience) a WHERE a->>'ownerId'=$6 AND (a->>'agentId' IS NULL OR a->>'agentId'=$7)))`,
          [
            this.ownerId,
            input.viewId,
            input.version,
            input.reference,
            input.revision,
            input.callerOwnerId,
            input.callerAgentId,
          ],
        );
        await this.activity("projection-read", null, {
          viewId: input.viewId,
          version: input.version,
          reference: input.reference,
          revision: input.revision,
          found: rows.length === 1,
        });
        return rows[0]?.record ?? null;
      },
    });
  }
}
