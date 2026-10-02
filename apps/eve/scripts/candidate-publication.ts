import { createRequire } from 'node:module';
import { BetaIntegration } from '../lib/beta-integration/runtime.ts';
import { engineeringConfig } from '../lib/engineering/runtime.ts';
import { OwnerPublication } from '../lib/engineering/owner-publication.ts';
import { CandidatePublication } from '../lib/engineering/candidate-publication.ts';
import { CandidateGitHub } from '../lib/engineering/candidate-publication-github.ts';

const [workId, decisionId] = process.argv.slice(2);
if (process.env.VERCEL_ENV || !workId || process.env.MYEVE_PUBLICATION_WORK_ID !== workId ||
    !decisionId || process.env.MYEVE_BETA_MODE !== 'private-alpha')
  throw Error('Explicit local publication worker binding required');
const config = await engineeringConfig();
if (config.ownerId !== process.env.MYEVE_OWNER_ID) throw Error('Publication owner mismatch');
const {Pool} = createRequire(import.meta.url)('pg');
const pool = new Pool({connectionString: process.env.DATABASE_URL, max: 4});
const integration = new BetaIntegration(pool, {repository: config.profile.repository, maxCostUsd: 1.35, maxDurationSeconds: 600});
const publisher = new CandidatePublication(new OwnerPublication(integration), new CandidateGitHub());
let stopping = false;
process.on('SIGTERM', () => {stopping = true;});
process.on('SIGINT', () => {stopping = true;});
try {
  if (decisionId === '--watch') {
    // No decision means no effect. Only this owner/Work's confirmed durable decisions
    // can reach the publication adapter; unknown effects are never retried here.
    while (!stopping) {
      const rows = await integration.query(`SELECT p.decision_id FROM engineering_candidate_publications p
        JOIN engineering_owner_decisions d ON d.id=p.decision_id
        WHERE p.owner_id=$1 AND d.work_id=$2 AND p.state IN ('APPROVED','PUBLISHING')`, [config.ownerId, workId]);
      for (const row of rows) {
        if (stopping) break;
        try {await publisher.run(config.ownerId, workId, row.decision_id);}
        catch {console.error('Publication blocked or uncertain; retained state requires readback.');}
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } else {
    await publisher.run(config.ownerId, workId, decisionId);
    console.log('Publication readback retained.');
  }
} catch {
  console.error('Publication worker stopped; no automatic effect retry.');
  process.exitCode = 1;
} finally {await pool.end();}
