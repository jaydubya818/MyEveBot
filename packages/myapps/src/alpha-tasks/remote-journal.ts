import {canonical,digest} from './contracts.ts';
import {requireValue} from '../contracts.ts';
import type {RemoteBinding, RemoteOutcome} from './remote-isolation.ts';

/** Dedicated executor-local database only. The application database is never supplied. */
export interface DeliveryDatabase {
  query(sql:string,values:unknown[]):Promise<{rows:Record<string,any>[]}>
}
export interface DeliveryRecord {
  outcome:RemoteOutcome|null;
  fenceRequested:boolean;
  fenceConfirmed:boolean;
  cleanupConfirmed:boolean;
}
export class PostgresRemoteDeliveryJournal {
  constructor(private readonly database:DeliveryDatabase) {}
  private key(b:RemoteBinding) {return [b.ownerId,b.installationId,b.hostId,b.operationId];}
  async claim(b:RemoteBinding,commandDigest:string):Promise<boolean> {
    const result=await this.database.query(`INSERT INTO myapps_remote_delivery
      (owner_id,installation_id,host_id,operation_id,command_digest,binding_digest)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING operation_id`,[...this.key(b),commandDigest,digest(b)]);
    await this.read(b,commandDigest);
    return result.rows.length===1;
  }
  async read(b:RemoteBinding,commandDigest:string):Promise<DeliveryRecord|null> {
    const row=(await this.database.query(`SELECT * FROM myapps_remote_delivery
      WHERE owner_id=$1 AND installation_id=$2 AND host_id=$3 AND operation_id=$4`,this.key(b))).rows[0];
    if(!row)return null;
    requireValue(row.command_digest===commandDigest&&row.binding_digest===digest(b),'APP_REMOTE_OPERATION_CONFLICT');
    return {outcome:row.outcome,fenceRequested:row.fence_requested,fenceConfirmed:row.fence_confirmed,cleanupConfirmed:row.cleanup_confirmed};
  }
  async complete(b:RemoteBinding,commandDigest:string,outcome:RemoteOutcome) {
    await this.database.query(`UPDATE myapps_remote_delivery SET outcome=$7::jsonb
      WHERE owner_id=$1 AND installation_id=$2 AND host_id=$3 AND operation_id=$4
      AND command_digest=$5 AND binding_digest=$6 AND outcome IS NULL AND NOT fence_requested`,
      [...this.key(b),commandDigest,digest(b),canonical(outcome)]);
  }
  async requestFence(b:RemoteBinding,commandDigest:string) {
    // Retaining even a pre-dispatch fence prevents a delayed authenticated command from running.
    await this.database.query(`INSERT INTO myapps_remote_delivery
      (owner_id,installation_id,host_id,operation_id,command_digest,binding_digest,fence_requested)
      VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT DO NOTHING`,[...this.key(b),commandDigest,digest(b)]);
    await this.read(b,commandDigest);
    await this.database.query(`UPDATE myapps_remote_delivery SET fence_requested=true
      WHERE owner_id=$1 AND installation_id=$2 AND host_id=$3 AND operation_id=$4
      AND command_digest=$5 AND binding_digest=$6`,[...this.key(b),commandDigest,digest(b)]);
  }
  async confirmFence(b:RemoteBinding,commandDigest:string,cleanup:boolean) {
    await this.database.query(`UPDATE myapps_remote_delivery SET fence_confirmed=true,
      cleanup_confirmed=cleanup_confirmed OR $7
      WHERE owner_id=$1 AND installation_id=$2 AND host_id=$3 AND operation_id=$4
      AND command_digest=$5 AND binding_digest=$6 AND fence_requested`,[...this.key(b),commandDigest,digest(b),cleanup]);
  }
}
