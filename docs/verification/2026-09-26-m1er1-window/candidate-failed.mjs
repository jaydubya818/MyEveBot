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

// Intentional defect (qualification candidate #1): using parseInt truncates
// fractional input instead of rejecting it, so positive fractional strings
// like "1.5" are incorrectly accepted as valid quantities.
const n = parseInt(trimmed, 10);

if (Number.isNaN(n) || n <= 0) {
  console.log(JSON.stringify({ error: 'invalid_quantity' }));
} else {
  console.log(JSON.stringify({ quantity: n }));
}
