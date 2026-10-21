import {describe,it,expect,vi} from 'vitest';
import {installedMissionControlEligibility} from './installed-eligibility.ts';
import {ownerEnrollmentSchema} from './execution-permit.ts';
const now=Date.now();
const enrollment={schema:'mc-owner-enrollment/v1',environment:'APPROVED_NONPRODUCTION',ownerId:'owner',ownerSubject:'subject',missionControlOwnerId:'operator',tenantId:'tenant',projectId:'project',connectionId:'connection',installationId:'installation',revision:1,
 issuer:'https://mc.example.test',audience:'https://eve.example.test',clerkIssuer:'https://clerk.example.test',clerkAudience:'convex',clerkAuthorizedParty:'https://mc.example.test',activeFrom:now-10000,expiresAt:now+60000,revokedAt:null,
 factoryVersion:'a'.repeat(64),executionContractSha256:'a'.repeat(64),capabilityPolicySha256:'a'.repeat(64),maxCostMicrousd:1300000,maxDurationSeconds:180,
 permitKeys:[{keyId:'a'.repeat(64),publicKey:'fixture',activeFrom:now-10000,notAfter:now+60000,revokedAt:null}]};
const env:NodeJS.ProcessEnv={NODE_ENV:'test',MYEVE_OWNER_ID:'owner',MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',MYEVE_MISSIONCONTROL_INSTALLATION_ID:'installation',MYEVE_MISSIONCONTROL_CONNECTION_ID:'connection',MYEVE_MISSIONCONTROL_URL:'https://mc.example.test',MYEVE_MISSIONCONTROL_AUDIENCE:'https://eve.example.test',MYEVE_MISSIONCONTROL_SECRET:'s'.repeat(32)};
const database=(document:unknown)=>({query:vi.fn(async(_sql:string,_values?:unknown[])=>[{document}])});
describe('canonical installed eligibility',()=>{
 it('mode alone cannot create enrollment',async()=>{expect(await installedMissionControlEligibility('owner',env,'admission',database(null))).toBeNull();});
 it('accepts exact current enrollment and queries only the owner',async()=>{const db=database(enrollment);const result=await installedMissionControlEligibility('owner',env,'admission',db);expect(result?.enrollment).toEqual(ownerEnrollmentSchema.parse(enrollment));expect(db.query.mock.calls[0][1]).toEqual(['owner']);});
 it.each(['ownerId','installationId','connectionId'])('rejects foreign %s',async field=>{await expect(installedMissionControlEligibility('owner',env,'admission',database({...enrollment,[field]:'foreign'}))).rejects.toThrow();});
 it.each([{expiresAt:now-1},{revokedAt:now},{activeFrom:now+60000}])('rejects unavailable admission enrollment %o',async change=>{await expect(installedMissionControlEligibility('owner',env,'admission',database({...enrollment,...change}))).rejects.toThrow();});
 it('allows only control-purpose recovery after enrollment expiry/revocation',async()=>{const result=await installedMissionControlEligibility('owner',env,'control',database({...enrollment,expiresAt:now-1,revokedAt:now}));expect(result?.config.purpose).toBe('control');});
 it('propagates database failure instead of selecting an unenrolled adapter',async()=>{await expect(installedMissionControlEligibility('owner',env,'control',{query:async()=>{throw Error('offline');}})).rejects.toThrow('offline');});
 it('does not accept absent query result as absent enrollment',async()=>{await expect(installedMissionControlEligibility('owner',env,'control',{query:async()=>[]})).rejects.toThrow();});
});
