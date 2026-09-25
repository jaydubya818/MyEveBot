"""Read-only Vercel metadata inventory. Never print environment values or raw API responses."""
import datetime
import json
import subprocess

TEAM = 'team_p8z8exJRTGfOPk1GC9vUOpv3'
PROJECTS = {'myeve': 'prj_L6faw25wnFGUZtrLKBIccg8gIDLR', 'relay': 'prj_3IRvr9knK5VJcBTgTYMvhv6ixmJK'}

def api(path):
    try:
        result = subprocess.run(['vercel', 'api', path, '--raw'], capture_output=True, text=True, timeout=25)
        if result.returncode:
            return {'inspectionError': 'Metadata request failed; no raw response retained'}
        return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, ValueError):
        return {'inspectionError': 'Metadata request timed out or was not JSON'}

def fields(value, names):
    return {key: value.get(key) for key in names}

inventory = {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'mode': 'read-only metadata; no secret values, database rows or deployment changes', 'projects': {}}
for name, project_id in PROJECTS.items():
    project = api(f'/v9/projects/{project_id}?teamId={TEAM}')
    record = fields(project, ['id', 'name', 'framework', 'rootDirectory', 'nodeVersion', 'buildCommand', 'installCommand', 'updatedAt', 'ssoProtection', 'inspectionError'])
    record['git'] = fields(project.get('link', {}), ['type', 'repo', 'org', 'productionBranch'])
    record['environmentNames'] = [fields(env, ['key', 'target', 'gitBranch', 'type']) for env in project.get('env', [])]
    record['targets'] = {key: fields(value, ['id', 'url', 'readyState', 'createdAt', 'target']) for key, value in project.get('targets', {}).items()}
    deployments = api(f'/v6/deployments?projectId={project_id}&teamId={TEAM}&limit=10')
    record['deployments'] = [{**fields(dep, ['uid', 'url', 'state', 'target', 'created']), **fields(dep.get('meta', {}), ['githubCommitSha', 'githubCommitRef'])} for dep in deployments.get('deployments', [])]
    if deployments.get('inspectionError'):
        record['deploymentInspectionError'] = deployments['inspectionError']
    domains = api(f'/v9/projects/{project_id}/domains?teamId={TEAM}')
    record['domains'] = [fields(domain, ['name', 'gitBranch', 'customEnvironmentId', 'verified']) for domain in domains.get('domains', [])]
    production_id = record['targets'].get('production', {}).get('id')
    if production_id:
        deployment = api(f'/v13/deployments/{production_id}?teamId={TEAM}')
        record['productionGit'] = fields(deployment.get('meta', {}), ['githubCommitSha', 'githubCommitRef'])
    inventory['projects'][name] = record
stores = api(f'/v1/storage/stores?teamId={TEAM}')
inventory['knownRelayStore'] = [{**fields(store, ['id', 'name', 'type', 'status']), 'plan': fields(store.get('billingPlan', {}), ['id', 'name'])} for store in stores.get('stores', []) if store.get('id') == 'store_NoIIiEgH5AoDvwL5']
inventory['storageInspectionError'] = stores.get('inspectionError')
print(json.dumps(inventory, indent=2))
