import { z } from "zod";
import { createHash } from "node:crypto";
export const publicOutputSchema=z.object({version:z.literal(1),serialization:z.literal('compact-json'),terminalNewline:z.literal('LF'),exitCode:z.literal(0),stderr:z.literal('empty')}).strict();
export const publicOutputBindingSchema=z.object({path:z.literal('test/output-contract.json'),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function validatePublicOutputContract(binding:z.infer<typeof publicOutputBindingSchema>,files:Record<string,string>,checks:{expectedOutput:string;expectedExitCode:number}[]){
 const text=files[binding.path];
 if(typeof text!=='string'||createHash('sha256').update(text).digest('hex')!==binding.sha256)throw Error('Public output contract differs from reviewed base');
 publicOutputSchema.parse(JSON.parse(text));
 for(const check of checks){
  let value:unknown;try{value=JSON.parse(check.expectedOutput);}catch{throw Error('Protected output violates public JSON contract');}
  if(check.expectedExitCode!==0||check.expectedOutput!==JSON.stringify(value)+'\n')throw Error('Protected output violates public line serialization contract');
 }
}
