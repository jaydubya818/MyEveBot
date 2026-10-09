import type {ExecutionDatabase} from '../execution-types.ts';
import {groupSchema,type AgentGroup,type GroupRepository} from './groups.ts';
/** Proposed shared schema adapter. No route instantiates this until canonical
 * schema allocation is accepted. Tests install the proposal in an isolated schema. */
export class PostgresGroups implements GroupRepository {
 constructor(readonly db:ExecutionDatabase){}
 async read(owner:string,id:string){const [row]=await this.db.query('SELECT document FROM agent_groups WHERE owner_id=$1 AND id=$2',[owner,id]);return row?groupSchema.parse(row.document):null;}
 async save(group:AgentGroup,expectedVersion:number|null,event:string){const g=groupSchema.parse(group);if(g.version!==(expectedVersion??0)+1)throw Error('Group version must advance once.');
  const [row]=await this.db.query(`WITH saved AS (
   INSERT INTO agent_groups(owner_id,id,version,document) SELECT $1,$2,$3,$4::jsonb WHERE $5::int IS NULL
   ON CONFLICT DO NOTHING RETURNING id,version
  ), updated AS (
   UPDATE agent_groups SET version=$3,document=$4::jsonb WHERE owner_id=$1 AND id=$2 AND version=$5 AND $5::int IS NOT NULL RETURNING id,version
  ), changed AS (SELECT * FROM saved UNION ALL SELECT * FROM updated), audit AS (
   INSERT INTO agent_group_audit(owner_id,group_id,version,event) SELECT $1,id,version,$6 FROM changed RETURNING group_id
  ) SELECT group_id FROM audit`,[g.ownerId,g.id,g.version,JSON.stringify(g),expectedVersion,event]);
  if(!row)throw Error('Group changed or already exists.');
 }
}
