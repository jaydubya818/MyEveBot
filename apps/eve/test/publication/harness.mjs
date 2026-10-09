import {Pool} from 'pg';import {readFile} from 'node:fs/promises';
import {BetaIntegration} from '../../lib/beta-integration/runtime.ts';import {OwnerPublication} from '../../lib/engineering/owner-publication.ts';
export const workId='b1e4e5cf-f0d5-45b1-97d3-d4a113bd09fb';
const url=process.env.MYEVE_PUBLICATION_TEST_DATABASE??'postgresql://postgres@127.0.0.1:55479/myeve_beta_publication';
if(!/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/myeve_beta_publication$/.test(url))throw Error('Disposable loopback database required');
export const pool=new Pool({connectionString:url});export const config=JSON.parse(await readFile(process.env.MYEVE_ENGINEERING_CONFIG,'utf8'));
export const integration=new BetaIntegration(pool,{repository:config.profile.repository,maxCostUsd:1.35,maxDurationSeconds:600});
export const service=new OwnerPublication(integration,async()=>config);
await pool.query(`CREATE TABLE IF NOT EXISTS publication_boundary_fixture(id int PRIMARY KEY, base text, branch text, pr jsonb, pushes int NOT NULL DEFAULT 0, prs int NOT NULL DEFAULT 0)`);
export async function reset(){await pool.query('TRUNCATE engineering_candidate_publications,engineering_owner_decisions,publication_boundary_fixture');await pool.query('INSERT INTO publication_boundary_fixture(id,base) VALUES(1,$1)',[config.approvedBase.sha]);}
export class ControlledGitHub {
 async base(){return (await pool.query('SELECT base FROM publication_boundary_fixture WHERE id=1')).rows[0].base;}
 async inspect(){const r=(await pool.query('SELECT * FROM publication_boundary_fixture WHERE id=1')).rows[0];return {branchSha:r.branch,pr:r.pr};}
 async push(b){await pool.query('UPDATE publication_boundary_fixture SET branch=$1,pushes=pushes+1 WHERE id=1',[b.candidate]);}
 async openPR(b){await pool.query('UPDATE publication_boundary_fixture SET pr=$1::jsonb,prs=prs+1 WHERE id=1',[JSON.stringify({number:1,url:`https://github.com/${b.repository}/pull/1`,candidate:b.candidate,base:b.baseRef,draft:true,open:true})]);}
}
export async function decide(action){const v=await service.view('owner',workId);return service.decide('owner',{workId,action,confirmed:true,bindingHash:v.bindingHash,previousId:v.decision?.id??null});}
