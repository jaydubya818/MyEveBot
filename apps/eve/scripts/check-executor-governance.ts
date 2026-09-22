import { createHash } from "node:crypto";
import { readdir,readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root=path.resolve(import.meta.dirname,"..");
const inventory=JSON.parse(await readFile(path.join(root,"scripts/executor-inventory.json"),"utf8")) as {
  executors:Record<string,{disposition?:"blocked"|"gateway";classification:string;reason:string;sha256:string}>;
};
const files:string[]=[];
for(const directory of ["agent","lib","app/api"]) {
  const entries=await readdir(path.join(root,directory),{recursive:true,withFileTypes:true});
  for(const entry of entries.filter(e=>e.isFile())) {
    const file=path.relative(root,path.join(entry.parentPath,entry.name));
    if(!file.endsWith(".ts") || file.endsWith(".test.ts"))continue;

    files.push(file);
  }
}
const errors:string[]=[];
for(const file of files) {
  const policy=inventory.executors[file];
  if(!policy){errors.push(`${file}: executor has no governance review`);continue;}
  if(!["ENFORCED","BLOCKED","READ_ONLY","INTERNAL","NOT_APPLICABLE"].includes(policy.classification)||!policy.reason)errors.push(`${file}: missing explicit classification/reason`);
  const source=await readFile(path.join(root,file),"utf8");
  if(createHash("sha256").update(source).digest("hex")!==policy.sha256)errors.push(`${file}: executor changed; review classification, target resolver, evidence and bypass tests before updating its fingerprint`);
  if(policy.disposition==="blocked") {
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    function visit(node:ts.Node):void {
      if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==="execute") {
        const first=node.body?.statements[0]?.getText(ast)??"";
        if(!/^return denyUnqualifiedExecutor\(/.test(first))errors.push(`${file}: blocked executor must deny before any work`);
      }
      ts.forEachChild(node,visit);
    }
    visit(ast);
    if(!/disableTool\(\)|denyUnqualifiedExecutor\(|denyUnqualifiedConnection\(/.test(source))errors.push(`${file}: missing fail-closed boundary`);
  }
  // The Federation adapter supplies an explicit database and narrowing authority
  // provider. Recognize that constructor without weakening the execution check.
  if(policy.disposition==="gateway"&&!/new ActionGateway\([^;\n]*\)\.execute\(|executeBrowserAction\(/.test(source))errors.push(`${file}: missing executor gateway`);
}
for(const file of Object.keys(inventory.executors))if(!files.includes(file))errors.push(`${file}: stale executor inventory`);
if(errors.length){console.error(errors.join("\n"));process.exitCode=1;}
else console.log(`executor governance ok: ${files.length} classified sources; UNKNOWN=0; Routine activation remains disabled`);
