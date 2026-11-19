import { WorkError } from '../engineering/types.ts';

/**
 * Read a page of Work items for an owner view without letting one unreadable item take the whole view down.
 * A projection can throw for a single retained Work (for example a spend record written under an older ceiling fails today's binding
 * validation). The view then omits that item, reports how many were omitted, and names the cause in the server log. Nothing is
 * repaired, retried or re-authorised here; this is presentation only. A WorkError keeps its meaning (not found, forbidden) and still
 * propagates, so an authorisation failure is never turned into a quietly shorter list.
 */
export async function readableWorks<I, T>(items: readonly I[], idOf: (item: I) => string, read: (item: I) => Promise<T>, view: string) {
  const settled = await Promise.all(items.map(async item => {
    try { return { ok: true as const, value: await read(item) }; }
    catch (error) {
      if (error instanceof WorkError) throw error;
      console.error('work_projection_failed', { view, workId: idOf(item), name: error instanceof Error ? error.name : 'unknown',
        message: (error instanceof Error ? error.message : String(error)).replace(/[^\x20-\x7e]/g, ' ').slice(0, 300) });
      return { ok: false as const };
    }
  }));
  const works = settled.flatMap(s => s.ok ? [s.value] : []);
  return { works, unavailableWorks: settled.length - works.length };
}
