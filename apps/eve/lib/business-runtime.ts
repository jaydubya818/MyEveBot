import { BusinessScopes } from "./business-scopes.ts";
import { betaIntegration } from "./beta-integration/runtime.ts";
/** Reuses the existing explicit disposable-local qualification composition.
 * Production always uses the canonical application database. */
export function businessScopes(actor:string){
 return new BusinessScopes(actor,process.env.MYEVE_BETA_MODE==='qualification'?betaIntegration():undefined);
}
