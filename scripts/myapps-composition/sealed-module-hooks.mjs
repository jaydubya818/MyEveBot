import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {isBuiltin} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Pure hook construction, no registration or imports of application code.
 * The reviewed producer must authenticate/freeze this exact file inventory and
 * register these hooks before the selected public entrypoint. File records are
 * capabilities from that producer, not standalone authenticity assertions.
 * These hooks constrain normal Node import/require resolution; they are not a
 * hostile-code sandbox, an asset-read tracer or an unused-path completeness proof.
 */
export function createSealedModuleHooks(approvedFiles,onRead=()=>{}){
 assert(Array.isArray(approvedFiles)&&approvedFiles.length>0,'MODULE_APPROVED_FILES_REQUIRED');
 const files=new Map();
 for(const record of approvedFiles){
  assert.deepEqual(Object.keys(record).sort(),['path','sha256','mode'].sort(),'MODULE_RECORD_FIELDS');
  assert.equal(realpathSync(record.path),record.path,'MODULE_CANONICAL_FILE_REQUIRED');
  assert.match(record.sha256,/^[a-f0-9]{64}$/,'MODULE_RECORD_DIGEST');
  assert(Number.isInteger(record.mode)&&record.mode>=0&&record.mode<=0o7777,'MODULE_RECORD_MODE');
  assert(!files.has(record.path),'MODULE_DUPLICATE_FILE');
  files.set(record.path,{...record});
 }
 function selected(url){
  if(isBuiltin(url))return null;
  const value=new URL(url);
  assert(value.protocol==='file:'&&!value.search&&!value.hash,'MODULE_FILE_URL_REQUIRED');
  const path=fileURLToPath(value),canonical=realpathSync(path),record=files.get(canonical);
  assert(record,'MODULE_UNSEALED_RESOLUTION');
  // Exact canonical paths also forbid undeclared symlink spellings. Approved
  // Nitro aliases resolve through Node to the canonical file before this check.
  assert.equal(path,canonical,'MODULE_UNDECLARED_ALIAS');
  return record;
 }
 function verify(record){
  const stat=lstatSync(record.path);
  assert(stat.isFile()&&(stat.mode&0o7777)===record.mode,'MODULE_FILE_MODE_CHANGED');
  assert.equal(hash(readFileSync(record.path)),record.sha256,'MODULE_FILE_BYTES_CHANGED');
 }
 return {
  resolve(specifier,context,nextResolve){
   if(context.parentURL)selected(context.parentURL);
   const result=nextResolve(specifier,context);
   const record=selected(result.url);if(record)verify(record);
   return result;
  },
  load(url,context,nextLoad){
   const record=selected(url);if(record)verify(record);
   const result=nextLoad(url,context);
   if(record){
    verify(record);
    if(result.source!==undefined&&result.source!==null)
     assert.equal(hash(result.source),record.sha256,'MODULE_UNREVIEWED_SOURCE_TRANSFORM');
    onRead({url:pathToFileURL(record.path).href,sha256:record.sha256,mode:record.mode,
     format:result.format??null,observation:result.source!==undefined&&result.source!==null
      ?'RETURNED_SOURCE_BYTES_VERIFIED':'FILE_AND_RESOLUTION_ONLY'});
   }
   return result;
  },
 };
}
