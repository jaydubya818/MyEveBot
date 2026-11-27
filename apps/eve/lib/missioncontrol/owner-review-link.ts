export function ownerReviewLink(origin: string | undefined, projectId: unknown, identity: { proposalId: string; digest: string } | { missionId: string }): string | null {
  if (!origin || typeof projectId !== 'string' || !projectId) return null;
  try {
    const url = new URL(origin);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    url.pathname = '/v2/missions'; url.searchParams.set('workspace', projectId);
    if ('proposalId' in identity) { url.searchParams.set('proposal', identity.proposalId); url.searchParams.set('proposalDigest', identity.digest); }
    else url.searchParams.set('reviewMission', identity.missionId);
    return url.toString();
  } catch { return null; }
}
