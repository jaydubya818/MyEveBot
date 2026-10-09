'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CapabilityView } from '@/lib/capability-control/store';
import type { CapabilityCommand, CapabilityReceipt } from '@/lib/capability-control/contracts';

const button = 'rounded-lg border border-kumo-hairline px-3 py-2 text-sm font-medium text-kumo-strong hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';
const badge = 'rounded-md border border-kumo-hairline px-2 py-1 text-xs font-medium';

export function CapabilitySettings() {
  const [view, setView] = useState<CapabilityView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState<CapabilityCommand | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const response = await fetch('/api/capability-control', { cache: 'no-store' });
      const body = await response.json();
      if (current !== sequence.current) return;
      if (!response.ok) throw new Error(body.error ?? 'Capabilities could not be loaded.');
      setView(body); setError('');
    } catch (failure) {
      if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Capabilities could not be loaded.');
    } finally { if (current === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);

  async function send(command: CapabilityCommand) {
    if (saving) return;
    setSaving(true); setError(''); setNotice(''); setRetry(command);
    try {
      const response = await fetch('/api/capability-control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status < 500) setRetry(null);
        throw new Error(body.error ?? 'The capability change could not be confirmed.');
      }
      const receipt = body as CapabilityReceipt;
      setRetry(null);
      await load();
      setNotice(receipt.status === 'PENDING_PROPAGATION'
        ? 'Preference saved. The change is awaiting backend acknowledgement and is not yet effective everywhere.'
        : receipt.status === 'PENDING_BACKEND'
        ? 'Control request saved. Backend acknowledgement is pending; active Work has not been confirmed stopped.'
        : 'Preference saved. Existing Work is preserved. Execution still requires backend approval.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The change could not be confirmed. Retry the same request to check its outcome.');
    } finally { setSaving(false); }
  }
  function change(capabilityId: string, operation: CapabilityCommand['operation'], limitMicros?: number) {
    if (!view || saving || loading || retry) return;
    void send({ requestId: crypto.randomUUID(), expectedRevision: view.revision, capabilityId, operation,
      ...(limitMicros === undefined ? {} : { limitMicros }) });
  }
  const busy = saving || loading || retry !== null;
  const groups = [...new Set(view?.capabilities.map(item => item.group) ?? [])];

  return <div className="space-y-6" aria-busy={loading || saving}>
    <header className="space-y-2">
      <p className="max-w-2xl text-sm text-kumo-subtle">Set capability preferences for your assistant. Organization restrictions, setup, qualification, and approval still apply.</p>
      <button className={button} disabled={saving || loading} onClick={() => void load()}>Refresh capabilities</button>
    </header>
    {loading && <p role="status">Loading capability policy…</p>}
    {error && <div role="alert" className="rounded-xl border border-kumo-hairline bg-kumo-tint p-4"><p>{error}</p>
      {retry && <button className={`${button} mt-3`} disabled={saving} onClick={() => void send(retry)}>Retry last request</button>}
      {!retry && <p className="mt-2 text-sm">Refresh to load the latest state before making another change.</p>}
    </div>}
    {notice && <p role="status" className="rounded-xl border border-kumo-hairline p-4 text-sm">{notice}</p>}
    {view && <>
      <section aria-label="Policy status" className="space-y-2 rounded-xl border border-kumo-hairline bg-kumo-tint p-4 text-sm">
        <p>{view.platformOwner ? 'Platform-owner testing defaults are enabled.' : 'Standard owner defaults apply.'} Policy revision {view.revision}.</p>
        <p>{view.activeWork.message}</p>
        {view.propagation && <p role="status">Policy propagation: {view.propagation.status} · revision {view.propagation.revision}.
          {view.propagation.status === 'PENDING_PROPAGATION' && ' Backend acknowledgement is pending. The change is not yet effective everywhere.'}</p>}
        {view.pendingCommand && <button className={button} disabled={busy} onClick={() => void send(view.pendingCommand!)}>Retry policy propagation</button>}
        <p>Backend integration is awaiting qualification. These controls save preferences; they do not grant execution or confirm that active Work has stopped.</p>
        {view.evidenceStatus !== 'CURRENT' && <p>Current availability evidence is unavailable. Capabilities remain non-operational until verified.</p>}
      </section>
      {view.capabilities.length === 0 && <p>No capabilities are registered for this installation.</p>}
      {groups.map(group => <section key={group} aria-label={group} className="space-y-3">
        <h3 className="text-lg font-semibold text-kumo-strong">{group}</h3>
        <div className="divide-y divide-kumo-hairline rounded-xl border border-kumo-hairline">
          {view.capabilities.filter(item => item.group === group).map(item => <article key={item.id} className="space-y-3 p-4" aria-label={item.name}>
            <div className="flex items-start justify-between gap-4">
              <div><h4 className="font-semibold text-kumo-strong">{item.name}</h4><p className="mt-1 text-sm text-kumo-subtle">{item.description}</p></div>
              <button type="button" role="switch" aria-checked={item.preference === 'ENABLED'} aria-label={`${item.preference === 'ENABLED' ? 'Disable' : 'Enable'} ${item.name}`}
                disabled={busy || !!item.control} className={`${button} min-w-20 shrink-0`}
                onClick={() => change(item.id, item.preference === 'ENABLED' ? 'disable' : 'enable')}>
                {item.preference === 'ENABLED' ? 'On' : 'Off'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-kumo-subtle"><span className={badge}>{item.preference}</span>
              <span className={badge}>{item.readiness}</span><span className={badge}>{item.availability}</span>
              {item.control && <span className={badge}>{item.control} · {item.backendControl?.complete ? 'ACKNOWLEDGED' : 'PENDING_BACKEND'}</span>}
              {item.experimental && <span className={badge}>Experimental</span>}
            </div>
            {item.control && item.backendControl && !item.backendControl.complete && <button className={button} disabled={busy}
              onClick={() => void send({ requestId: item.backendControl!.requestId, expectedRevision: item.backendControl!.revision - 1,
                capabilityId: item.id, operation: item.backendControl!.operation as 'pause' | 'revoke' })}>Refresh backend acknowledgments</button>}
            {item.control && item.backendControl?.complete && <button className={button} disabled={busy}
              onClick={() => change(item.id, 'enable')}>Enable new Work after confirmed control</button>}
            {item.backendControl?.backends.map(backend => <p className="text-sm text-kumo-subtle" key={backend.backendId}>
              {backend.backendId}: {backend.state.replaceAll('_', ' ')}.
              {!backend.inventoryComplete && ' Active Work inventory remains incomplete.'}
            </p>)}
            <details className="text-sm">
              <summary className="cursor-pointer rounded py-2 font-medium text-kumo-strong">Setup, permissions, and controls</summary>
              <div className="mt-2 space-y-3 text-kumo-subtle">
                <p>Required setup: {item.setupRequirements.join(', ') || 'None'}.</p>
                <p>Qualification: {item.qualificationRequirements.join(', ') || 'None'}.</p>
                <p>Dependencies: {[...item.dependencies, ...item.alternativeDependencies].join(', ') || 'None'}. Dependencies do not receive authority automatically.</p>
                <p>Required permissions: {item.requiredPermissions.join(', ')}.</p>
                <p>Administrator policy: {item.administrator}. Execution authority: {item.authority}.</p>
                <a className="inline-block py-2 font-medium underline underline-offset-4" href="/manage/system">Open setup and system diagnostics</a>
                <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const amount = Number(data.get('budget'));
                  const micros = Math.round(amount * 1_000_000);
                  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(micros) || micros > 1_000_000_000_000) { setError('Enter a valid nonnegative budget up to 1,000,000 USD.'); return; }
                  change(item.id, 'set_budget', micros);
                }}>
                  <label className="flex flex-col gap-1">Maximum new Work budget (USD)
                    <input key={`${item.id}-${item.limitMicros}`} aria-label={`${item.name} budget in USD`} name="budget" type="number" min="0" max="1000000" step="0.000001" required
                      defaultValue={item.limitMicros === null ? '' : item.limitMicros / 1_000_000}
                      className="rounded-lg border border-kumo-hairline bg-kumo-base px-3 py-2 text-kumo-strong" disabled={busy} />
                  </label><button className={button} disabled={busy}>Save budget</button>
                </form>
                <p>Budget preferences do not reserve funds or permit spending.</p>
                <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || !!item.control} onClick={() => change(item.id, 'pause')}>Request pause</button>
                  <button type="button" className={button} disabled={busy || item.control === 'REVOKE_REQUESTED'} onClick={() => change(item.id, 'revoke')}>Request revocation</button></div>
                <p>Pause and revocation remain pending until the responsible backend confirms control. Unknown accounting exposure is preserved.</p>
              </div>
            </details>
          </article>)}
        </div>
      </section>)}
      <section aria-label="Audit history" className="space-y-3">
        <h3 className="text-lg font-semibold text-kumo-strong">Audit history</h3>
        {view.audit.length === 0 ? <p className="text-sm text-kumo-subtle">No capability changes yet.</p> : <ol className="divide-y divide-kumo-hairline rounded-xl border border-kumo-hairline px-4">
          {view.audit.map(event => <li key={String(event.revision)} className="py-3 text-sm">
            <p>{String(event.capability_id)} · {String(event.operation)} · revision {String(event.revision)}</p>
            <p className="text-kumo-subtle">{String(event.source)} · {new Date(String(event.created_at)).toLocaleString()}</p>
          </li>)}
        </ol>}
        <p className="text-xs text-kumo-subtle">Showing the latest 50 changes. Earlier history remains stored.</p>
      </section>
    </>}
  </div>;
}
