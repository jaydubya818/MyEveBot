import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

/** Hash an ordered transcript by its JSON values, independent of object-key
 * insertion order. Every array position, object key, scalar type and value is
 * retained. Non-JSON values fail closed rather than being omitted/coerced.
 * This is an internal JSON-value encoding, not a signed-document standard.
 */
export function hashOrderedTranscript(events){
 assert(Array.isArray(events),'TRANSCRIPT_ARRAY_REQUIRED');
 const active=new Set();
 function encode(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){
   assert(Number.isFinite(value)&&!Object.is(value,-0),'TRANSCRIPT_JSON_NUMBER_REQUIRED');
   return JSON.stringify(value);
  }
  assert(value&&typeof value==='object','TRANSCRIPT_JSON_VALUE_REQUIRED');
  assert(!active.has(value),'TRANSCRIPT_JSON_CYCLE');
  const array=Array.isArray(value),keys=Reflect.ownKeys(value);
  assert(array||Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null,
   'TRANSCRIPT_PLAIN_JSON_OBJECT_REQUIRED');
  assert(keys.every(key=>typeof key==='string'),'TRANSCRIPT_JSON_STRING_KEYS_REQUIRED');
  const fields=array?keys.filter(key=>key!=='length'):keys;
  if(array)assert.deepEqual(fields,Array.from({length:value.length},(_,index)=>String(index)),
   'TRANSCRIPT_DENSE_JSON_ARRAY_REQUIRED');
  for(const key of fields){
   const descriptor=Object.getOwnPropertyDescriptor(value,key);
   assert(descriptor.enumerable&&Object.hasOwn(descriptor,'value'),'TRANSCRIPT_JSON_DATA_FIELD_REQUIRED');
  }
  active.add(value);
  try{
   return array?'['+fields.map(key=>encode(value[key])).join(',')+']':
    '{'+fields.sort().map(key=>JSON.stringify(key)+':'+encode(value[key])).join(',')+'}';
  }finally{active.delete(value);}
 }
 return createHash('sha256').update(encode(events)).digest('hex');
}
