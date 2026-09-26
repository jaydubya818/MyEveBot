import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const [body, existingConversationId] = process.argv.slice(2);
if (!body || body.length > 1000) {
  console.error('Usage: node --import tsx tools/relay-alpha/send.mjs "question" [conversation-id]');
  process.exit(2);
}
const config = JSON.parse(await readFile(process.env.ALPHA_RELAY_CONFIG_FILE, 'utf8'));
const credential = JSON.parse(await readFile(process.env.ALPHA_RELAY_CREDENTIAL_FILE, 'utf8')).alphaCredential;
if (!credential || !/^https:\/\//.test(config.relayOrigin) ||
  !/^relay:\/\/acct_[a-zA-Z0-9]+\/agt_[a-zA-Z0-9]+$/.test(config.sofieAddress)) {
  throw new Error('Invalid Alpha Relay configuration.');
}
const conversationId = existingConversationId || `alpha-sofie-${randomUUID()}`;
const command = async value => {
  const response = await fetch(`${config.relayOrigin}/api/v2/federation`, {
    method: 'POST',
    headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Relay ${value.operation} failed: HTTP ${response.status} ${result.error?.code ?? ''}`);
  return result;
};
const sent = await command({ operation: 'submit', input: {
  target: config.sofieAddress,
  resource: 'messages',
  capability: 'message.send',
  idempotencyKey: `alpha-sofie-${randomUUID()}`,
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  conversationId,
  payload: { subject: 'Alpha question', body },
} });
if (!sent.requestId) throw new Error('Relay did not return a request ID.');
console.log(JSON.stringify({ requestId: sent.requestId, conversationId, status: sent.status }));
const deadline = Date.now() + 10 * 60_000;
let finished = false;
while (Date.now() < deadline) {
  const result = await command({ operation: 'get', requestId: sent.requestId });
  if (['COMPLETED', 'REJECTED', 'CANCELED', 'EXPIRED'].includes(result.status)) {
    finished = true;
    console.log(JSON.stringify({ requestId: sent.requestId, status: result.status, result: result.result }));
    if (result.status !== 'COMPLETED' || !result.result?.reply?.body) process.exitCode = 1;
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 5000));
}
if (!finished) {
  console.error(`No completed reply before expiry: ${sent.requestId}`);
  process.exitCode = 1;
}
