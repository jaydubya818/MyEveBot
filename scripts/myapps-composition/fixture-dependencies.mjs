import assert from 'node:assert/strict';
import {constants,cpSync,lstatSync,readdirSync,readFileSync,readlinkSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve,sep} from 'node:path';

const inside=(root,path)=>path===root||path.startsWith(root+sep);

/** Copy installed dependency bytes into an owned source fixture. Preserve
 * relative workspace/bin links, but never retain links to the host checkout.
 * No install, package import, executable launch or source dependency mutation. */
export function materializeFixtureDependencies(sourceRoot,targetRoot){
 const source=realpathSync(sourceRoot),target=realpathSync(targetRoot);
 assert(!inside(source,target)&&!inside(target,source),'FIXTURE_DEPENDENCY_ROOT_OVERLAP');
 for(const name of ['package.json','package-lock.json']){
  const before=readFileSync(join(source,name)),after=readFileSync(join(target,name));
  assert(before.length<=16*1024**2&&before.equals(after),'FIXTURE_DEPENDENCY_SOURCE_CHANGED');
 }
 const roots=['node_modules','apps/eve/node_modules'];
 const copies=[];
 function inspectLinks(from,to,afterCopy){
  const pending=[[from,to]];
  while(pending.length){
   const [input,output]=pending.pop();
   for(const name of readdirSync(input).sort()){
    const path=join(input,name),mapped=join(output,name),stat=lstatSync(path);
    if(stat.isSymbolicLink()){
     const link=readlinkSync(path);
     assert(!isAbsolute(link)&&inside(target,resolve(dirname(mapped),link)),'FIXTURE_DEPENDENCY_LINK_ESCAPE');
     if(afterCopy)assert(inside(target,realpathSync(path)),'FIXTURE_DEPENDENCY_LINK_TARGET_ESCAPE');
    }else if(stat.isDirectory())pending.push([path,mapped]);
    else assert(stat.isFile(),'FIXTURE_DEPENDENCY_FILE_TYPE');
   }
  }
 }
 for(const name of roots){
  const declared=join(source,name),output=join(target,name);
  if(!lstatSync(declared,{throwIfNoEntry:false})){
   assert(name!=='node_modules','FIXTURE_DEPENDENCY_ROOT_MISSING');
   continue; // npm may hoist all app dependencies into the root.
  }
  const input=realpathSync(declared);
  assert(lstatSync(input).isDirectory(),'FIXTURE_DEPENDENCY_NOT_DIRECTORY');
  assert(!inside(input,output)&&!inside(output,input),'FIXTURE_DEPENDENCY_COPY_OVERLAP');
  assert.equal(realpathSync(dirname(output)),dirname(output),'FIXTURE_DEPENDENCY_TARGET_PARENT_ALIAS');
  assert(!lstatSync(output,{throwIfNoEntry:false}),'FIXTURE_DEPENDENCY_TARGET_EXISTS');
  inspectLinks(input,output,false);
  copies.push({input,output,name});
 }
 for(const {input,output} of copies){
  cpSync(input,output,{recursive:true,verbatimSymlinks:true,force:false,errorOnExist:true,mode:constants.COPYFILE_FICLONE});
  assert.equal(realpathSync(output),output,'FIXTURE_DEPENDENCY_ROOT_ALIAS');
 }
 // Check after both copies: workspace links may target the app dependency tree.
 for(const {output} of copies)inspectLinks(output,output,true);
 return {materialized:copies.map(({name})=>name)};
}
