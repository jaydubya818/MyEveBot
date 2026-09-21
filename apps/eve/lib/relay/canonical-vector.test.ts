import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import vector from './fixtures/canonical-relay-v2.json';
import { canonical, verifyEnvelope } from './transport.ts';

// Copied verbatim from Relay's CI-verified contract fixture. Never hand-edit.
const clock = Date.parse('2030-01-01T00:00:00Z');
const identity = {issuer:'https://relay.synthetic.invalid',address:'relay://b/b',ownerId:'b',agentId:'b',keyId:'qualification-vector-v2',keyVersion:'qualification-version-1',publicKey:vector.publicKeyPem};
const encode = (x: unknown) => Buffer.from(canonical(x)).toString('base64url');
describe('canonical Relay-owned v2 golden vector', () => {
  it('verifies the same immutable public vector that Relay CI verifies', () => {
    expect(verifyEnvelope(vector.token, identity, clock).id).toBe('vector-request');
    expect(createHash('sha256').update(vector.canonicalAuthenticatedPayload).digest('hex')).toBe(vector.expectedDigest);
  });
  it.each(['kid','keyVersion','alg','typ'])('denies changed %s before accepting claims', field => {
    const parts=vector.token.split('.');const header=JSON.parse(Buffer.from(parts[0]!, 'base64url').toString());
    header[field]='unsupported';parts[0]=encode(header);
    expect(()=>verifyEnvelope(parts.join('.'),identity,clock)).toThrow();
  });
  it('denies a wrong pinned key/version, tampering and downgrade', () => {
    expect(()=>verifyEnvelope(vector.token,{...identity,keyVersion:'wrong'},clock)).toThrow();
    expect(()=>verifyEnvelope(vector.token,{...identity,keyId:'wrong'},clock)).toThrow();
    const parts=vector.token.split('.');const claims=JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    claims.envelope.payload.body='tampered';parts[1]=encode(claims);
    expect(()=>verifyEnvelope(parts.join('.'),identity,clock)).toThrow();
    parts[0]=encode({alg:'EdDSA',typ:'relay-federation+jwt',kid:identity.keyId});
    expect(()=>verifyEnvelope(parts.join('.'),identity,clock)).toThrow();
  });
  it('rejects future and historical-v2 formats rather than probing alternate parsers', () => {
    for(const header of [{alg:'Ed25519',typ:'relay-federation-v3',kid:identity.keyId,keyVersion:identity.keyVersion},{alg:'Relay-Ed25519-SHA256-v2',typ:'relay-federation+digest',kid:identity.keyId,v:2,purpose:'federation-delivery'}]){
      const parts=vector.token.split('.');parts[0]=encode(header);
      expect(()=>verifyEnvelope(parts.join('.'),identity,clock)).toThrow();
    }
  });
});
