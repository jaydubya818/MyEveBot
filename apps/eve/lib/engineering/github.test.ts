import {describe,it,expect} from "vitest";
import {GitHubAdapter,workBranch} from "./github.ts";
import {fixture} from "../../test/engineering-fixtures.ts";
function transport(overrides:Record<string,unknown>={}) {
  const calls:{url:string;method:string}[]=[];
  const request=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input),path=url.replace('https://api.github.com/repos/fixture/golden','');calls.push({url,method:init?.method??'GET'});
    const standard:Record<string,unknown>={
      '':{private:true,full_name:'fixture/golden',permissions:{push:true}},
      '/commits/main':{sha:'a'.repeat(40)},
    };
    let body=Object.hasOwn(overrides,path)?overrides[path]:standard[path];
    if(path.startsWith('/pulls?'))body=overrides.prs??[];
    if(path.startsWith('/git/ref/heads/'))body=overrides.head?{object:{sha:overrides.head}}:null;
    if(path.includes('/check-runs?'))body={total_count:0,check_runs:[]};
    if(body===null||body===undefined)return new Response('{}',{status:404});
    return Response.json(body);
  }) as typeof fetch;
  return {request,calls};
}
describe('Trusted GitHub boundary',()=>{
  it('denies public or mismatched repositories before reading an issue',async()=>{
    for(const repo of [{private:false,full_name:'fixture/golden',permissions:{push:true}},{private:true,full_name:'customer/production',permissions:{push:true}},{private:true,full_name:'fixture/golden',permissions:{push:false}}]){
      const t=transport({'':repo});await expect(new GitHubAdapter('fixture/golden','fixture-token',t.request).issue(1)).rejects.toThrow(/qualification repository/);expect(t.calls).toHaveLength(1);
    }
  });
  it('rejects a concurrently changed human head before any mutation',async()=>{
    const f=fixture(),t=transport({head:'b'.repeat(40)}),adapter=new GitHubAdapter('fixture/golden','fixture-token',t.request);
    await expect(adapter.publish(f.contract,f.candidate,workBranch(f.work.id),null)).rejects.toThrow(/binding changed/);
    expect(t.calls.every(call=>call.method==='GET')).toBe(true);
  });
  it('refuses ambiguous duplicate PRs',async()=>{const f=fixture(),t=transport({prs:[{},{}]});await expect(new GitHubAdapter('fixture/golden','fixture-token',t.request).observe(f.contract,workBranch(f.work.id))).rejects.toThrow(/Multiple PRs/);});
  it('does not follow credential-bearing redirects',async()=>{
    let policy:RequestRedirect|undefined;
    const request=(async(_url:RequestInfo|URL,init?:RequestInit)=>{policy=init?.redirect;return new Response('{}',{status:401});}) as typeof fetch;
    await expect(new GitHubAdapter('fixture/golden','fixture-token',request).issue(1)).rejects.toThrow(/401/);expect(policy).toBe('error');
  });
});
