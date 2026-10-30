/** Render the existing QDEV app/journal schema. No database client, credentials or execution mode. */
import { JOURNAL_SCHEMA } from '../../apps/eve/lib/qualification/journal.ts';
import { RETAINED_ADMISSION_SCHEMA } from '../../apps/eve/lib/qualification/retained-admissions.ts';

if (process.argv.length !== 2) {
  console.error('Usage: node --import tsx scripts/qdev-ops/render-runtime-schema.mjs');
  process.exit(2);
}

process.stdout.write([
  '-- QDEV application/journal tables only. Review and apply on the exact new isolated app database.',
  '-- Generated from the runtime schema constants; this command never connects to a database.',
  JOURNAL_SCHEMA.trim(),
  RETAINED_ADMISSION_SCHEMA.trim(),
  '',
].join('\n'));
