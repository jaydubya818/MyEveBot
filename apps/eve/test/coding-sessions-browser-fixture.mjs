// Exact component rendered with synthetic states. No application DB/model use.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
let js=ts.transpileModule(await readFile(new URL("../components/engineering/coding-sessions.tsx",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
js=js.replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve("react/jsx-runtime")));
const {CodingSessions}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const states=["PREPARED","RUNNING_REPORTED","INTERRUPTING","RECONCILIATION_REQUIRED","CANCELLED","COMPLETED_UNVERIFIED","VERIFICATION_FAILED","INDEPENDENT_CHECKS_PASSED"];
const server=createServer((req,res)=>{
 const state=new URL(req.url,"http://127.0.0.1").searchParams.get("state")??states[0];
 const verified=state==="INDEPENDENT_CHECKS_PASSED";
 const view={sessions:[{id:"synthetic-attempt",state,assignedAgentId:"coder-one",repository:"fixture/disposable-project",attemptNumber:1,baseSha:"abcdef012345",worktree:"/disposable/worktrees/coder-one",associationLimit:"Producer-recorded detached worktree.",independentlyVerified:verified}],artifacts:verified?[{},{}]:[],progress:state==="RUNNING_REPORTED"?"Implementing the assigned role":"Saved canonical observation",nextStep:"Review the retained Work",result:verified?{candidate:"123456abcdef"}:null,capabilities:{resume:{supported:false,reason:"Managed process resume requires qualification."}}};
 if(state==='CANCELLED'){view.historicalCheckpoint={candidate:'retained-checkpoint-abcdef'};view.accounting={blocker:'Cancelled budget retained; fresh Work requires new admission'};}
 res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
 res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sofie session qualification</title><style>body{font:16px system-ui;max-width:850px;margin:40px auto;padding:20px;color:#202b38;background:#fafafa}.owner-card{background:white;border:1px solid #ddd;border-radius:12px;padding:24px}.owner-list{padding:0;list-style:none}code{overflow-wrap:anywhere}nav{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}</style></head><body><p>Synthetic presentation fixture · no provider execution</p><nav>'+states.map(s=>'<a href="?state='+s+'">'+s+'</a>').join('')+'</nav>'+renderToStaticMarkup(createElement(CodingSessions,{view}))+'</body></html>');
});
const port=Number(process.env.SOFIE_BROWSER_FIXTURE_PORT??55494);
server.listen(port,"127.0.0.1",()=>console.log(`Synthetic session component fixture: http://127.0.0.1:${port}`));
for(const signal of ["SIGTERM","SIGINT"])process.on(signal,()=>server.close());
