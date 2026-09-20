import { createHash,createPublicKey,verify } from "node:crypto";
import { z } from "zod";
import { canonicalActionValue } from "../../approvals.ts";
import { executionCommandSchema,type Environment } from "./contracts.ts";
export const ownerCommandHash=(value:unknown)=>"sha256:"+createHash("sha256").update(JSON.stringify(canonicalActionValue(value))).digest("hex");
const signedSchema=z.object({payload:z.object({domain:z.literal("relay.owner-execution.v1"),environment:z.enum(["development","preview","production"]),audience:z.string().min(1).max(255),keyId:z.string().min(1).max(80),nonce:z.string().uuid(),issuedAt:z.number().int(),expiresAt:z.number().int(),scope:z.literal("owner.run"),payloadHash:z.string().regex(/^sha256:[a-f0-9]{64}$/),command:executionCommandSchema}).strict(),signature:z.string().min(1).max(128)}).strict();
export function verifyOwnerCommand(value:unknown,trust:{environment:Environment;audience:string;keys:Record<string,string>},now=Date.now()){
 const signed=signedSchema.parse(value),p=signed.payload,time=Math.floor(now/1000),pem=trust.keys[p.keyId];
 if(!pem||p.environment!==trust.environment||p.audience!==trust.audience||p.issuedAt>time+5||p.issuedAt<time-60||p.expiresAt<=time||p.expiresAt-p.issuedAt!==60||p.payloadHash!==ownerCommandHash(p.command))throw new Error("Owner ingress signature denied.");
 const key=createPublicKey(pem);if(key.asymmetricKeyType!=="ed25519"||!verify(null,Buffer.from(ownerCommandHash(p)),key,Buffer.from(signed.signature,"base64url")))throw new Error("Owner ingress signature denied.");
 return p;
}
