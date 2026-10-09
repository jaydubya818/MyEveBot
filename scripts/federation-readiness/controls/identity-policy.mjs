/** Render only; no Google/Vercel mutations and no credentials. */
export function workloadIdentityPolicy({ projectId, projectNumber, customEnvironmentId }) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId ?? '') || !/^[0-9]{6,20}$/.test(projectNumber ?? '') || !/^env_[A-Za-z0-9]+$/.test(customEnvironmentId ?? '')) throw Error('OWNER_PROJECT_AND_REAL_CUSTOM_ENVIRONMENT_REQUIRED');
  const team='team_p8z8exJRTGfOPk1GC9vUOpv3',relay='prj_3IRvr9knK5VJcBTgTYMvhv6ixmJK';
  const principal=`principalSet://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/fq-6384519e0e01/attribute.project_id/${relay}`;
  return {
    apply:false,
    projectId,
    pool:'fq-6384519e0e01',provider:'vercel-relay-fq',
    issuerUri:'https://oidc.vercel.com/jaydubya818',
    allowedAudiences:['https://vercel.com/jaydubya818'],
    attributeMapping:{'google.subject':'assertion.sub','attribute.project_id':'assertion.project_id'},
    attributeCondition:`assertion.owner_id == '${team}' && assertion.project_id == '${relay}' && assertion.environment == 'federation-qualification' && assertion.custom_environment_id == '${customEnvironmentId}' && assertion.sub == 'owner:jaydubya818:project:relay:environment:federation-qualification'`,
    authentication:'Direct STS token exchange; no service-account key or project-wide role',
    bindings:[
      {keys:['fq-evidence','fq-delivery','fq-passport'],principal,permissions:['cloudkms.cryptoKeyVersions.get','cloudkms.cryptoKeyVersions.useToSign']},
      {keys:['fq-envelope'],principal,permissions:['cloudkms.cryptoKeyVersions.get','cloudkms.cryptoKeyVersions.useToEncrypt','cloudkms.cryptoKeyVersions.useToDecrypt']},
    ],
    denied:['create','update','destroy','setIamPolicy','other-projects','production','preview','development','other-custom-environments','MyEve-A','MyEve-B','Railway-workers'],
    publicKeys:'Pinned public SPKI and version metadata obtained by operator; runtime needs no getPublicKey permission.',
  };
}
