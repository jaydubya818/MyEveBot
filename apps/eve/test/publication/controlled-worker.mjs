import {pool,service,ControlledGitHub,workId} from './harness.mjs';
import {CandidatePublication} from '../../lib/engineering/candidate-publication.ts';
let stop=false;process.on('SIGTERM',()=>{stop=true});
try{while(!stop){const rows=(await pool.query("SELECT decision_id FROM engineering_candidate_publications WHERE state IN ('APPROVED','PUBLISHING')")).rows;for(const row of rows)try{await new CandidatePublication(service,new ControlledGitHub()).run('owner',workId,row.decision_id);}catch{}await new Promise(r=>setTimeout(r,250));}}finally{await pool.end();}
