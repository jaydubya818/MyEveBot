/** Qualification authority: one durable row, transactionally locked across hosts.
 * The pool is supplied by the operator; no credentials/configuration are logged.
 * No automatic session creation, expiry refund, retry, or crash-slot release.
 */
export class Denied extends Error { constructor(code) { super(code); this.name = 'Denied'; } }
const deny = code => { throw new Denied(code); };
function validateState(s) {
  const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  if (!s || s.version !== 1 || typeof s.stopped !== 'boolean' || !Number.isFinite(s.start) || !Number.isFinite(s.lastClock)
      || !integer(s.http,2000) || !integer(s.submissions,120) || s.submissions > s.http
      || !integer(s.charged,5000000) || !integer(s.artifacts,8) || !integer(s.artifactBytes,524288)
      || !s.components || !integer(s.components.myeve,2000000) || !integer(s.components.peer,3000000)
      || s.charged !== s.components.myeve + s.components.peer
      || !s.calls || !integer(s.calls.myeve,8) || !integer(s.calls.peer,5000000)
      || !s.active || Array.isArray(s.active) || !s.operations || Array.isArray(s.operations)
      || !Array.isArray(s.events) || !Array.isArray(s.recentHttp) || s.recentHttp.some(t=>!Number.isFinite(t))) deny('CORRUPT_STATE');
  const active=Object.values(s.active);
  if (active.filter(x=>x.kind==='http').length>2 || active.filter(x=>x.kind==='model').length>1
      || active.some(x=>!['http','model'].includes(x.kind))) deny('CORRUPT_STATE');
}
export const ddl = `CREATE SCHEMA fq_control;
REVOKE ALL ON SCHEMA fq_control FROM PUBLIC;
CREATE TABLE fq_control.sessions (
 id text PRIMARY KEY, state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON fq_control.sessions FROM PUBLIC;`;

export class Authority {
  constructor(pool, id) {
    if (!/^[a-z0-9_-]{8,80}$/.test(id)) deny('INVALID_SESSION');
    this.pool = pool; this.id = id;
  }
  async transaction(action) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("SET LOCAL statement_timeout = '2000ms'");
      await db.query("SET LOCAL lock_timeout = '1500ms'");
      const { rows } = await db.query('SELECT state FROM fq_control.sessions WHERE id=$1 FOR UPDATE', [this.id]);
      if (rows.length !== 1 || rows[0].state.version !== 1) deny('SESSION_UNAVAILABLE');
      // Read DB time AFTER acquiring lock; transaction_timestamp can be stale.
      const { rows: clock } = await db.query('SELECT extract(epoch FROM clock_timestamp())::float8 AS time');
      const state = rows[0].state, now = clock[0].time;
      validateState(state);
      if (now < state.lastClock) deny('CLOCK_ROLLBACK');
      state.lastClock = now;
      const result = await action(state, now);
      await db.query('UPDATE fq_control.sessions SET state=$2::jsonb WHERE id=$1', [this.id, JSON.stringify(state)]);
      await db.query('COMMIT'); return result;
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      if (error instanceof Denied) throw error;
      deny('AUTHORITY_UNAVAILABLE');
    } finally { db.release(); }
  }
  async create(authorization) {
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(authorization)) deny('AUTHORIZATION_REQUIRED');
    // Operator-only. Runtime must not receive INSERT privilege or this connection.
    await this.pool.query(`INSERT INTO fq_control.sessions(id,state)
      SELECT $1, jsonb_build_object('version',1,'authorization',$2::text,
      'start',t,'lastClock',t,'stopped',false,'http',0,'submissions',0,'charged',0,
      'components',jsonb_build_object('myeve',0,'peer',0),'calls',jsonb_build_object('myeve',0,'peer',0),
      'artifacts',0,'artifactBytes',0,'active','{}'::jsonb,'operations','{}'::jsonb,
      'recentHttp','[]'::jsonb,'events','[]'::jsonb)
      FROM (SELECT extract(epoch FROM clock_timestamp())::float8 AS t) clock`, [this.id, authorization]);
  }
  check(state, now, cleanup = false) {
    if (state.stopped || now >= state.start + (cleanup ? 3600 : 2700)) deny('SESSION_CLOSED');
  }
  operation(state, id) {
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(id)) deny('INVALID_OPERATION');
    if (Object.hasOwn(state.operations, id)) deny('OPERATION_ALREADY_RESERVED');
  }
  async http(id, { submission = false, cleanup = false } = {}) {
    if (typeof submission !== 'boolean' || typeof cleanup !== 'boolean' || (submission && cleanup)) deny('CLASSIFICATION');
    return this.transaction((s, now) => {
      this.check(s, now, cleanup); this.operation(s, id);
      if (s.http >= 2000 || (submission && s.submissions >= 120)) deny('REQUEST_LIMIT');
      if (Object.values(s.active).filter(x => x.kind === 'http').length >= 2) deny('HTTP_CONCURRENCY');
      s.recentHttp = s.recentHttp.filter(t => now - t < 1);
      if (s.recentHttp.length >= 2) deny('HTTP_RATE');
      s.http++; s.submissions += Number(submission); s.recentHttp.push(now);
      s.operations[id] = { kind: 'http', status: 'RESERVED' };
      s.active[id] = { kind: 'http', at: now };
      s.events.push({ kind: 'http', at: now, operation: id, submission });
      return id;
    });
  }
  async model(id, component, maximumMicrousd, liabilityReference) {
    if (!['myeve','peer'].includes(component) || !Number.isSafeInteger(maximumMicrousd) || maximumMicrousd <= 0 || maximumMicrousd > 250000 || !/^[a-zA-Z0-9_-]{8,120}$/.test(liabilityReference)) deny('LIABILITY_BOUND_REQUIRED');
    return this.transaction((s, now) => {
      this.check(s, now); this.operation(s, id);
      if (Object.values(s.active).some(x => x.kind === 'model')) deny('MODEL_CONCURRENCY');
      if (s.charged >= 4000000 || s.charged + maximumMicrousd > 5000000) deny('MODEL_SPEND');
      if (s.components[component] + maximumMicrousd > (component === 'myeve' ? 2000000 : 3000000) || (component === 'myeve' && s.calls.myeve >= 8)) deny('COMPONENT_SPEND');
      s.charged += maximumMicrousd; s.components[component] += maximumMicrousd; s.calls[component]++;
      s.operations[id] = { kind: 'model', status: 'RESERVED', maximumMicrousd, liabilityReference };
      s.active[id] = { kind: 'model', at: now, deadline: Math.min(now + 60, s.start + 2700), maximumMicrousd };
      s.events.push({ kind: 'model', at: now, operation: id, component, maximumMicrousd });
      return id;
    });
  }
  async complete(id, actualMicrousd) {
    return this.transaction((s, now) => {
      const operation = s.active[id];
      if (!operation) deny('NO_ACTIVE_OPERATION');
      if (operation.kind === 'model' && (!Number.isSafeInteger(actualMicrousd) || actualMicrousd < 0 || actualMicrousd > operation.maximumMicrousd)) {
        s.stopped = true; s.events.push({ kind: 'uncertain_liability', at: now, operation: id });
        return false; // Keep slot and full reservation. Never refund errors/cancellation.
      }
      delete s.active[id]; s.operations[id].status = 'COMPLETED';
      s.events.push({ kind: 'completed', at: now, operation: id }); return true;
    });
  }
  async artifact(id, chunks) {
    const parts = []; let bytes = 0;
    for await (const chunk of chunks) {
      if (!(chunk instanceof Uint8Array) || (bytes += chunk.byteLength) > 65536) deny('ARTIFACT_SIZE');
      parts.push(Buffer.from(chunk));
    }
    await this.transaction((s, now) => {
      this.check(s, now); this.operation(s, id);
      if (s.artifacts >= 8 || s.artifactBytes + bytes > 524288) deny('ARTIFACT_TOTAL');
      s.artifacts++; s.artifactBytes += bytes; s.operations[id] = { kind: 'artifact', status: 'COMPLETED' };
      s.events.push({ kind: 'artifact', at: now, operation: id, bytes });
    });
    return Buffer.concat(parts); // Expose no partial oversized content.
  }
  async stop() {
    return this.transaction((s, now) => {
      if (!s.stopped) s.events.push({ kind: 'stop', at: now });
      s.stopped = true;
    });
  }
  async status() { return this.transaction((s, now) => ({ ...s, now })); }
  async assertRunning() {
    return this.transaction((s, now) => {
      this.check(s, now);
      if (Object.values(s.active).some(x => x.kind === 'model' && now >= x.deadline)) deny('MODEL_DEADLINE');
      return true;
    });
  }
}

/** Trusted ingress adapter must await full response consumption before release. */
export async function boundedHttp(authority, id, classification, invoke) {
  await authority.http(id, classification);
  const result = await invoke();
  // Uncertain upstream completion fences its slot; do not retry around it.
  await authority.complete(id);
  return result;
}

/** A VERIFIED worst-case liability is required, not an estimated price string.
 * The caller owns the provider request and must disable retries. Unknown result
 * retains the slot and stops the session; abort does not assert provider stopped.
 */
export async function boundedModel(authority, id, bound, invoke) {
  await authority.model(id, bound.component, bound.maximumMicrousd, bound.reference);
  const abort = new AbortController(); let polling = false;
  const timer = setInterval(async () => {
    if (polling) return; polling = true;
    try { await authority.assertRunning(); } catch { abort.abort(); } finally { polling = false; }
  }, 250);
  const deadline = setTimeout(() => abort.abort(), 60000);
  try {
    // Close stop race between admission and invoking the provider.
    await authority.assertRunning();
    const result = await invoke(abort.signal);
    if (!(await authority.complete(id, result.actualMicrousd))) deny('UNCERTAIN_MODEL_LIABILITY');
    return result;
  } catch {
    await authority.complete(id, undefined).catch(() => {});
    deny('MODEL_EXECUTION_UNCONFIRMED');
  } finally { clearInterval(timer); clearTimeout(deadline); }
}

export async function emergencyStop(authority, adapters, timeoutMs = 2000) {
  const result = {};
  async function attempt(name, action) {
    const abort = new AbortController(); let timer;
    try {
      const completed = await Promise.race([
        Promise.resolve().then(() => action(abort.signal)),
        new Promise(resolve => { timer = setTimeout(() => { abort.abort(); resolve(false); }, timeoutMs); }),
      ]);
      result[name] = completed === true ? 'VERIFIED' : 'UNCONFIRMED';
    } catch { result[name] = 'UNCONFIRMED'; }
    finally { clearTimeout(timer); }
  }
  await attempt('admission', async () => { await authority.stop(); return true; });
  // Every brake is attempted even when a sibling or KMS is unavailable. Adapters
  // must honor AbortSignal and independently verify state; a timeout is NOT success.
  await Promise.all(['revokeCredentials','revokeGrants','denyQueuedWork','stopWorkers','disableModelCredentials']
    .map(name => attempt(name, signal => adapters[name](signal))));
  await attempt('preserveEvidence', signal => adapters.preserveEvidence(signal));
  // Last so normal revocations have a chance to emit their existing signed audit.
  await attempt('freezeDatabaseLogins', signal => adapters.freezeDatabaseLogins(signal));
  return { ...result, complete: Object.values(result).every(x => x === 'VERIFIED') };
}
