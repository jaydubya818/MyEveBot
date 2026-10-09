import { SOFTWARE_ENGINEER_ROLE_V1, JSTACK_CAPABILITY_PACK_V1, NORMAL_MODE_V1, POTATO_MODE_V1 } from '../digital-worker/packs.ts';

/** Behavior/context only. No field is an execution grant or a spending limit. */
export function nativeBehavior(mode: 'normal' | 'potato' = 'normal') {
  const role=SOFTWARE_ENGINEER_ROLE_V1,pack=JSTACK_CAPABILITY_PACK_V1;
  const selected=mode==='potato'?POTATO_MODE_V1:NORMAL_MODE_V1;
  return {
    composition:{role:{id:role.id,version:role.version},capabilityPacks:[{id:pack.id,version:pack.version}],mode:{id:selected.id,version:selected.version}},
    sources:[role.source,pack.source,selected.source],
    guidance:[...role.contextGuidance,...role.verificationGuidance,...role.escalationGuidance,
      ...pack.contextGuidance,...pack.verificationGuidance,
      'JStack procedures: '+pack.skillRefs.join(', ')+'. Apply the repository language, module format and test conventions from approved files; do not impose a different stack.',
      mode==='potato'
        ? 'Within already delegated Work, proactively diagnose failed checks and continue bounded repairs. Minimize routine interruptions; inspect independent results before explaining completion.'
        : 'Explain the next bounded engineering step. Follow the owner’s requested plan and report routine recovery choices; do not infer a larger objective.',
      'Role, JStack and mode cannot grant repository authority, increase budget, change owner identity, bypass Action Gateway, enable publication or production. Escalate scope, authority and irreversible changes.'],
  };
}
