"""Create inert Git refs required by Vercel branch-specific env validation.
No product code, executable build scripts, parent tree, or credentials are copied.
"""
import json, subprocess

def api(path, body=None):
    args=['gh','api',path]
    if body is not None: args+=['--method','POST','--input','-']
    r=subprocess.run(args,input=json.dumps(body) if body else None,text=True,capture_output=True,timeout=30)
    if r.returncode: raise RuntimeError('GitHub metadata operation failed; raw response suppressed')
    return json.loads(r.stdout)

result=[]
for repo, branches in [('MyEveBot',['codex/fq-a-6384519e0e01','codex/fq-b-6384519e0e01']),('relay',['codex/fq-relay-6384519e0e01'])]:
    root=f'repos/jaydubya818/{repo}/git'
    refs=api(root+'/matching-refs/heads/codex/fq-')
    if any(r['ref']=='refs/heads/'+b for r in refs for b in branches):
        raise RuntimeError('Slot already exists; reconcile before rerun')
    tree=api(root+'/trees',{'tree':[{'path':'QUALIFICATION_DISABLED.md','mode':'100644','type':'blob','content':'Synthetic qualification placeholder. No application code. Do not deploy or enable. Both gates NOT_RUN.\n'},{'path':'vercel.json','mode':'100644','type':'blob','content':json.dumps({'$schema':'https://openapi.vercel.sh/vercel.json','git':{'deploymentEnabled':False}})+'\n'}]})
    commit=api(root+'/commits',{'message':'chore: reserve disabled synthetic qualification branch slots','tree':tree['sha'],'parents':[]})
    for branch in branches:
        ref=api(root+'/refs',{'ref':'refs/heads/'+branch,'sha':commit['sha']})
        result.append({'repository':repo,'branch':branch,'commit':commit['sha'],'productCode':False,'gitDeploymentEnabled':False})
print(json.dumps({'slots':result},indent=2))
