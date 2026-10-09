import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { readReceipt, receiptDescription } from '../lib/myfactory-protocol.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyId = `ed25519-${createHash('sha256').update(publicKey.export({ format: 'der', type: 'spki' })).digest('hex').slice(0, 32)}`;
const receipt = { version: 1, issueId: 'test-request', workOrderId: 'test-work-order', state: 'queued' };
const encoded = Buffer.from(JSON.stringify(receipt)).toString('base64url');
const signature = sign(null, Buffer.from(`MYFACTORY_RECEIPT_V1\0${keyId}\0${encoded}`), privateKey).toString('base64url');
const envelope = { encoded, signature, keyId };
const description = value => `<!-- MYFACTORY_RECEIPT_V1 -->\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n\n<!-- /MYFACTORY_RECEIPT_V1 -->`;

test('reads legacy and current key-ID receipts using the same pinned key', () => {
  assert.equal(readReceipt('No receipt yet', publicKey, receipt.issueId), null);
  assert.deepEqual(readReceipt(receiptDescription('Request', receipt, privateKey), publicKey, receipt.issueId), receipt);
  assert.deepEqual(readReceipt(description(envelope), publicKey, receipt.issueId), receipt);
  const pem = publicKey.export({ format: 'pem', type: 'spki' });
  assert.deepEqual(readReceipt(description(envelope), pem, receipt.issueId), receipt);
});

test('rejects altered payload, key identity, signature, envelope and request binding', () => {
  const wrongKey = generateKeyPairSync('ed25519').publicKey;
  const invalid = [
    { ...envelope, encoded: Buffer.from(JSON.stringify({ ...receipt, workOrderId: 'other' })).toString('base64url') },
    { ...envelope, keyId: 'ed25519-' + '0'.repeat(32) },
    { ...envelope, keyId: null },
    { ...envelope, keyId: undefined }, // Removing the ID cannot downgrade the signed domain.
    { ...envelope, signature: envelope.signature + '=' },
    { ...envelope, signature: 'A'.repeat(86) },
    { ...envelope, publicKey: wrongKey.export({ format: 'pem', type: 'spki' }) },
  ];
  for (const value of invalid) assert.throws(() => readReceipt(description(value), publicKey, receipt.issueId));
  assert.throws(() => readReceipt(description(envelope), wrongKey, receipt.issueId));
  assert.throws(() => readReceipt(description(envelope), publicKey, 'different-request'), /Wrong factory receipt/);
  assert.throws(() => readReceipt(description(envelope) + description(envelope), publicKey, receipt.issueId));
});
