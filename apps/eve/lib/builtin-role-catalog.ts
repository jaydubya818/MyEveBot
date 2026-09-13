import { createRoleCatalog } from "./role-catalog.ts";
import { GENERAL_ROLE_PACK } from "./role-packs/general.ts";
import { SOFTWARE_DEVELOPMENT_ROLE_PACK } from "./role-packs/software-development.ts";
import { VERIFICATION_ROLE_PACK } from "./role-packs/verification.ts";

export const BUILTIN_ROLE_PACKS = [
  GENERAL_ROLE_PACK,
  SOFTWARE_DEVELOPMENT_ROLE_PACK,
  VERIFICATION_ROLE_PACK,
] as const;

export const BUILTIN_ROLE_CATALOG = createRoleCatalog(BUILTIN_ROLE_PACKS);

export const DECLARED_QA_ROLE_IDS = VERIFICATION_ROLE_PACK.roles.map(({ role }) => role.id);
