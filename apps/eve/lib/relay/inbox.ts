import { FederationStore } from "./store.ts";
import { RelayClient } from "./client.ts";
import {
  decryptSecret,
  encryptSecret,
  requestDigest,
  verifyEnvelope,
  type Envelope,
} from "./transport.ts";
import { answerPublished } from "./projection.ts";
import { receiveArtifact } from "./artifacts.ts";
import { executeExternalWork } from "./work.ts";
import { submissionSchema } from "./contracts.ts";
import { decideApproval } from "../approvals.ts";

type ResponseBody = {
  status: "ACCEPTED" | "REJECTED" | "REQUIRE_APPROVAL" | "COMPLETED";
  result?: unknown;
};
async function acknowledge(
  store: FederationStore,
  envelope: Envelope,
  response: ResponseBody,
) {
  const connection = await store.connection();
  const client = new RelayClient(connection.credential);
  const result = await client.command({
    operation: "respond",
    requestId: envelope.id,
    input: response,
  });
  await store.database.query(
    "UPDATE myeve_relay_requests SET relay_acknowledged=true,updated_at=now() WHERE owner_id=$1 AND request_id=$2",
    [store.ownerId, envelope.id],
  );
  return result;
}
async function processRequest(store: FederationStore, envelope: Envelope) {
  const started = await store.begin(envelope.id);
  if (!started) return { requestId: envelope.id, state: "already_claimed" };
  try {
    let response: ResponseBody;
    if (envelope.capability !== "work.request") {
      const connection = await store.connection();
      await new RelayClient(connection.credential).command({
        operation: "respond",
        requestId: envelope.id,
        input: { status: "ACCEPTED" },
      });
    }
    if (
      envelope.capability === "knowledge.query" &&
      (envelope.payload as { mode: string }).mode !== "RECORD_RETRIEVAL"
    )
      response = { status: "REJECTED" };
    else if (envelope.capability === "knowledge.query")
      response = {
        status: "COMPLETED",
        result: await answerPublished(envelope, store.publishedReader()),
      };
    else if (envelope.capability === "message.send")
      response = { status: "COMPLETED", result: { acknowledged: true } };
    else if (envelope.capability === "artifact.share")
      response = {
        status: "COMPLETED",
        result: await receiveArtifact(store, envelope),
      };
    else {
      const work = await executeExternalWork(store, envelope, async () => {
        const connection = await store.connection();
        await new RelayClient(connection.credential).command({
          operation: "respond",
          requestId: envelope.id,
          input: { status: "ACCEPTED" },
        });
      });
      response = {
        status: work.status,
        ...("result" in work ? { result: work.result } : {}),
      };
      if ("reason" in work)
        await store.activity("work-authority", envelope.id, {
          decision: work.status,
          reason: work.reason,
        });
    }
    const state =
      response.status === "COMPLETED"
        ? "completed"
        : response.status === "REQUIRE_APPROVAL"
          ? "needs_approval"
          : "denied";
    // Durable local result precedes Relay acknowledgement, so failed network
    // delivery cannot run a model, local action, or artifact transfer twice.
    await store.finish(envelope.id, state, response, state);
    await acknowledge(store, envelope, response);
    if (
      envelope.capability === "knowledge.query" &&
      response.status === "COMPLETED"
    ) {
      const knowledge = response.result as {
        publicationVersion: number;
        records: Array<{ reference: string; recordType: string }>;
      };
      await store.activity("disclosure-pending-signed-receipt", envelope.id, {
        callerOwnerId: envelope.caller.ownerId,
        callerAgentId: envelope.caller.agentId,
        viewId: envelope.resource,
        publicationVersion: knowledge.publicationVersion,
        records: knowledge.records.map(({ reference, recordType }) => ({
          reference,
          recordType,
        })),
        count: knowledge.records.length,
        grantId: envelope.authorizationContext.grantId,
        policyDecisionId: envelope.authorizationContext.policyDecisionId,
      });
    }
    return { requestId: envelope.id, state };
  } catch {
    // Preserve a completed response for retry. An interrupted execution never
    // returns to the runnable state automatically.
    await store.database.query(
      "UPDATE myeve_relay_requests SET state='recovery_required',local_decision='Verification required before retry',updated_at=now() WHERE owner_id=$1 AND request_id=$2 AND state='processing'",
      [store.ownerId, envelope.id],
    );
    throw new Error(
      "External request needs verification or acknowledgement recovery.",
    );
  }
}
export async function receiveDelivery(store: FederationStore, token: string) {
  const connection = await store.connection();
  const envelope = verifyEnvelope(token, connection);
  const { fresh, row } = await store.claim(envelope);
  if (!fresh) {
    // A claim can survive a crash before the execution CAS. Only untouched
    // incoming claims may resume; processing claims remain fenced.
    if (row.state === "incoming") return processRequest(store, envelope);
    if (row.result_encrypted) {
      const response = decryptSecret<ResponseBody>(
        store.ownerId,
        row.result_encrypted,
      );
      await acknowledge(store, envelope, response);
    }
    return { requestId: envelope.id, replay: true, state: row.state };
  }
  return processRequest(store, envelope);
}
export async function pollRelay(store: FederationStore) {
  await store.purge();
  const connection = await store.connection();
  const inbox = await new RelayClient(connection.credential).command({
    operation: "poll",
  });
  if (!Array.isArray(inbox.deliveries) || inbox.deliveries.length > 10)
    throw new Error("Invalid Relay inbox.");
  const results = [];
  for (const delivery of inbox.deliveries) {
    try {
      results.push(await receiveDelivery(store, String(delivery.token)));
    } catch {
      results.push({
        requestId: delivery.requestId,
        state: "recovery_required",
      });
    }
  }
  // Completed local work can need an ack retry even when Relay has moved to
  // ACCEPTED/RUNNING and therefore no longer offers it as an inbox delivery.
  const pending = await store.database.query(
    "SELECT envelope_encrypted,result_encrypted FROM myeve_relay_requests WHERE owner_id=$1 AND direction='incoming' AND state IN ('completed','denied','needs_approval') AND NOT relay_acknowledged AND expires_at>now()",
    [store.ownerId],
  );
  for (const row of pending) {
    try {
      await acknowledge(
        store,
        decryptSecret(store.ownerId, row.envelope_encrypted),
        decryptSecret(store.ownerId, row.result_encrypted),
      );
    } catch {
      /* Kept for a future bounded poll or owner inspection. */
    }
  }
  return { delivered: inbox.deliveries.length, results };
}
export async function decideExternalWork(
  store: FederationStore,
  requestId: string,
  accept: boolean,
) {
  const [row] = await store.database.query(
    "SELECT * FROM myeve_relay_requests WHERE owner_id=$1 AND request_id=$2 AND state='needs_approval' AND expires_at>now()",
    [store.ownerId, requestId],
  );
  if (!row?.local_run_id)
    throw new Error("No current local approval for this request.");
  const [approval] = await store.database.query(
    "SELECT id,binding_hash FROM task_approval_decisions WHERE owner_id=$1 AND task_id=$2 AND status='pending' AND expires_at>now() ORDER BY requested_at DESC LIMIT 1",
    [store.ownerId, row.local_run_id],
  );
  if (!approval) throw new Error("Approval is no longer pending.");
  await decideApproval({
    ownerId: store.ownerId,
    id: approval.id,
    bindingHash: approval.binding_hash,
    decision: accept ? "approved" : "denied",
    decidedBy: store.ownerId,
  });
  const envelope = decryptSecret<Envelope>(
    store.ownerId,
    row.envelope_encrypted,
  );
  if (!accept) {
    await store.database.query(
      "UPDATE myeve_relay_requests SET state='denied',result_encrypted=$3,relay_acknowledged=false WHERE owner_id=$1 AND request_id=$2",
      [
        store.ownerId,
        requestId,
        encryptSecret(store.ownerId, { status: "REJECTED" }),
      ],
    );
    return acknowledge(store, envelope, { status: "REJECTED" });
  }
  await store.database.query(
    "UPDATE myeve_relay_requests SET state='accepted',result_encrypted=NULL,relay_acknowledged=false WHERE owner_id=$1 AND request_id=$2 AND state='needs_approval'",
    [store.ownerId, requestId],
  );
  return processRequest(store, envelope);
}
export async function sendExternal(store: FederationStore, value: unknown) {
  const input = submissionSchema.parse(value);
  const connection = await store.connection();
  const response = await new RelayClient(connection.credential).command({
    operation: "submit",
    input,
  });
  const envelope = {
    ...input,
    id: response.requestId,
    caller: { ownerId: connection.ownerId, agentId: connection.agentId },
    target: { address: input.target },
    authorizationContext: { grantId: "outgoing" },
  };
  await store.database.query(
    `INSERT INTO myeve_relay_requests(owner_id,request_id,direction,capability,conversation_id,sender_owner_id,sender_agent_id,envelope_hash,envelope_encrypted,expires_at,state)
    VALUES($1,$2,'outgoing',$3,$4,$5,$6,$7,$8,$9,'accepted') ON CONFLICT(owner_id,request_id) DO NOTHING`,
    [
      store.ownerId,
      response.requestId,
      input.capability,
      input.conversationId ?? null,
      connection.ownerId,
      connection.agentId,
      requestDigest(envelope as Envelope),
      encryptSecret(store.ownerId, input),
      input.expiresAt,
    ],
  );
  return response;
}
export async function getExternalResult(
  store: FederationStore,
  requestId: string,
) {
  const [row] = await store.database.query(
    "SELECT envelope_encrypted FROM myeve_relay_requests WHERE owner_id=$1 AND request_id=$2 AND direction='outgoing'",
    [store.ownerId, requestId],
  );
  if (!row) throw new Error("Outgoing request not found.");
  const connection = await store.connection();
  const client = new RelayClient(connection.credential);
  const response = await client.command({ operation: "get", requestId });
  if (response.status === "COMPLETED") {
    await store.database.query(
      "UPDATE myeve_relay_requests SET state='completed',result_encrypted=$3 WHERE owner_id=$1 AND request_id=$2",
      [store.ownerId, requestId, encryptSecret(store.ownerId, response.result)],
    );
    const input = submissionSchema.parse(
      decryptSecret(store.ownerId, row.envelope_encrypted),
    );
    if (input.capability === "knowledge.query") {
      const result = response.result;
      await store.database.query(
        `INSERT INTO myeve_relay_external_context(owner_id,request_id,source_owner_id,source_agent_id,publication_id,publication_version,context_encrypted,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,request_id) DO NOTHING`,
        [
          store.ownerId,
          requestId,
          result.ownerId,
          result.publisherAgentId,
          input.resource,
          result.publicationVersion,
          encryptSecret(store.ownerId, result),
          input.expiresAt,
        ],
      );
    }
  }
  return response;
}
