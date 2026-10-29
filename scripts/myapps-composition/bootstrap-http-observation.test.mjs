/** Actual HTTP observer block with a fake Node HTTP module/server only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./current-runtime-bootstrap.mjs',import.meta.url),'utf8');
const start=source.indexOf("if(spec.kind!=='client'){"),end=source.indexOf("\nif(spec.kind==='client'){",start);
assert(start>0&&end>start);
function fixture(){
 const rows=[],http={createServer(){const server=new EventEmitter();server.address=()=>({address:'127.0.0.1',port:3185});return server;}};let synced=0;
 vm.runInNewContext(source.slice(start,end),{spec:{kind:'eve',httpProbeMarker:'nonce'},require:name=>{assert.equal(name,'node:http');return http;},process:{pid:123},record:row=>rows.push(row),syncBuiltinESMExports:()=>synced++,Reflect});
 return {server:http.createServer(),rows,synced};
}
test('actual listening event records the owned PID/address/port',()=>{const f=fixture();f.server.emit('listening');assert.deepEqual(JSON.parse(JSON.stringify(f.rows)),[{kind:'listener',pid:123,address:'127.0.0.1',port:3185}]);assert.equal(f.synced,1);});
test('proxy health marker is recorded at the actual server socket',()=>{const f=fixture();f.server.emit('request',{headers:{'x-myeve-runtime-probe':'nonce-proxy',cookie:'never-retain'},socket:{localPort:3185},url:'/eve/v1/health'});assert.equal(f.rows[0].marker,'nonce-proxy');assert.equal(f.rows[0].port,3185);assert(!JSON.stringify(f.rows).includes('never-retain'));});
test('other requests and foreign markers do not disclose cookies or message bodies',()=>{const f=fixture();f.server.emit('request',{headers:{'x-myeve-runtime-probe':'foreign',cookie:'never-retain'},socket:{localPort:3185},url:'/api/auth/login'});assert.equal(f.rows.length,0);});
