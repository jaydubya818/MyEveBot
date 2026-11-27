import { describe, it, expect } from 'vitest';
import { ownerReviewLink } from './owner-review-link';
describe('owner review handoff', () => {
  it('links exact project, proposal and digest without authority', () => {
    const u = new URL(ownerReviewLink('https://mc.example.test', 'project-1', { proposalId: 'proposal-1', digest: 'sha256:123' })!);
    expect(u.pathname).toBe('/v2/missions'); expect([...u.searchParams.keys()]).toEqual(['workspace','proposal','proposalDigest']);
    expect(u.searchParams.get('proposal')).toBe('proposal-1'); expect(u.searchParams.get('proposalDigest')).toBe('sha256:123');
  });
  it('links the exact Result Mission', () => {
    expect(new URL(ownerReviewLink('http://localhost:5188','project-1',{missionId:'mission-1'})!).searchParams.get('reviewMission')).toBe('mission-1');
  });
  it('fails closed for missing or unsafe configured destinations', () => {
    for (const origin of [undefined,'javascript:alert(1)','https://user:secret@example.test','https://example.test/path','https://example.test?token=x','http://example.test'])
      expect(ownerReviewLink(origin,'p',{missionId:'m'})).toBeNull();
  });
});
