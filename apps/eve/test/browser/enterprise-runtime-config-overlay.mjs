import assert from 'node:assert/strict';
const declaration='export function enterpriseConfig(env: NodeJS.ProcessEnv = process.env): EnterpriseConfig {';
export function instrumentEnterpriseRuntimeConfig(source) {
  assert.equal(source.split(declaration).length,2,'Expected exactly one canonical enterpriseConfig declaration');
  assert.equal(source.includes('fixtureConfig'),false,'Runtime configuration overlay already present');
  return "import { readFileSync as fixtureConfig } from 'node:fs';\n"+source.replace(declaration,declaration+`
  if(process.env.MC_COMPOSED_BROWSER_CONFIG_FILE !== undefined) {
    let loaded: unknown;
    try { loaded=JSON.parse(fixtureConfig(process.env.MC_COMPOSED_BROWSER_CONFIG_FILE, "utf8")); }
    catch { throw Error('FIXTURE_ENTERPRISE_CONFIG_UNAVAILABLE'); }
    const fields=['MODE','URL','SECRET','OWNER_ID','OPERATOR_ID','TENANT_ID','PROJECT_ID','CONNECTION_ID'];
    if(!loaded || typeof loaded !== 'object' || Array.isArray(loaded)
      || !fields.every(field=>typeof (loaded as Record<string,unknown>)['MYEVE_MISSIONCONTROL_'+field] === 'string'
        && ((loaded as Record<string,string>)['MYEVE_MISSIONCONTROL_'+field]).length > 0)) throw Error('FIXTURE_ENTERPRISE_CONFIG_INVALID');
    env=loaded as NodeJS.ProcessEnv;
  }`);
}
