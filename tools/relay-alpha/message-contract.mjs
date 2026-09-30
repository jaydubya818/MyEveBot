/** Called only after Relay signature, audience and expiry verification. */
export function acceptsMessage(envelope, requestId, { alphaAddress, sofieOwnerId, sofieAgentId }) {
  return envelope.id === requestId && envelope.capability === 'message.send'
    && (envelope.resource === alphaAddress || envelope.resource === 'messages')
    && envelope.target.address === alphaAddress
    && envelope.caller.ownerId === sofieOwnerId && envelope.caller.agentId === sofieAgentId
    && typeof envelope.payload?.body === 'string'
    && envelope.payload.body.length > 0 && envelope.payload.body.length <= 4000;
}
