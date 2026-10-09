import { workerData, parentPort } from 'node:worker_threads';
import { ReferenceStore } from '../src/store.ts';
import { Crm } from '../src/crm.ts';
import { principal, makePackage, OWNER } from './fixtures.mjs';
const { path, kind, id, hash, args } = workerData;
const store = new ReferenceStore(path);
try {
  let result;
  if (kind === 'register') result = store.register('crm-request-1', makePackage());
  else if (kind === 'install') result = store.session(principal()).approveInstall(id, args.approvalId);
  else if (kind === 'disable') result = store.session(principal()).setEnabled(id, false, args.revision);
  else if (kind === 'revoke') result = store.revoke(OWNER, id, args.version);
  else result = new Crm(store, principal()).action(id, args.version ?? 1, hash, args.operation, args.input, args.key);
  parentPort.postMessage({ ok: true, result });
} catch(error) { parentPort.postMessage({ ok: false, error: error.message }); }
finally { store.close(); }
