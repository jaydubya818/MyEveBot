import { stdin } from 'node:process';

function readStdin(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

const raw = await readStdin(stdin);
const trimmed = raw.trim();

// Fix: only accept strings of one or more digits (no sign, no decimal
// point), so fractional input like "1.5" is rejected instead of truncated.
const isPositiveIntegerString = /^[0-9]+$/.test(trimmed);
const n = isPositiveIntegerString ? parseInt(trimmed, 10) : NaN;

if (Number.isNaN(n) || n <= 0) {
  console.log(JSON.stringify({ error: 'invalid_quantity' }));
} else {
  console.log(JSON.stringify({ quantity: n }));
}
