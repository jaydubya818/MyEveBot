/** Pure renderer. All inputs are public deployment bindings or credential hashes;
 * missing bindings fail rather than emitting an executable placeholder. */
export function configuration({origins,hashes,sources,owners,accounts,keys}){
 for(const name of ['myeve','relay','peer']){
  const u=new URL(origins[name]);if(u.protocol!=='https:'||u.origin!==origins[name])throw Error('Exact HTTPS origin required');
  if(!/^[a-f0-9]{40}$/.test(sources[name]))throw Error('Exact source SHA required');
 }
 for(const name of ['myeve','peer'])if(!/^fq[-_][A-Za-z0-9_-]+$/.test(owners[name])||!accounts[name])throw Error('Synthetic identity binding required');
 const principals={};
 for(const name of ['myeve','relay','peer']){
  principals[name]={role:'worker',component:name,sha:sources[name],ownerId:name==='relay'?'fq-relay':owners[name],credentialHash:hashes[name]};
  principals[`${name}-origin`]={role:'origin',worker:name,ownerId:name==='relay'?'fq-relay':owners[name],credentialHash:hashes[`${name}-origin`],...(name==='relay'?{accountIds:[accounts.myeve,accounts.peer]}:{})};
 }
 principals.operator={role:'operator',worker:'relay',credentialHash:hashes.operator};
 if(Object.values(principals).some(p=>!/^[a-f0-9]{64}$/.test(p.credentialHash)))throw Error('Credential hashes required');
 const routes={};
 const agentPath='^/api/(?:v2/(?:operator/)?federation|auth/login|agents(?:/[^/]+/credentials)?)$';
 for(const name of ['myeve','peer']){
  routes[`${name}:relay`]={url:origins.relay,methods:['GET','POST','DELETE'],pathPattern:agentPath,origin:'relay-origin',callers:[name],submissionOperations:['submit']};
  routes[`${name}:artifact-store`]={url:origins[name],methods:['POST'],pathPattern:'^/api/relay/qualification-artifacts$',origin:`${name}-origin`,callers:[name]};
  const peer=name==='myeve'?'peer':'myeve';
  routes[`${name}:artifact`]={url:origins[peer],methods:['GET'],pathPattern:'^/api/relay/artifacts/[^/]+$',origin:`${peer}-origin`,callers:[name]};
 }
 const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const versions=Object.values(keys);
 if(versions.length!==4||versions.some(v=>!/^projects\/[a-z0-9-]+\/locations\/us-east4\/keyRings\/fq-[a-f0-9]+\/cryptoKeys\/fq-[a-z]+\/cryptoKeyVersions\/[1-9][0-9]*$/.test(v)))throw Error('Exact four qualification key versions required');
 routes['google-sts']={url:'https://sts.googleapis.com',provider:true,methods:['POST'],pathPattern:'^/v1/token$',callers:['relay-origin']};
 routes['google-kms']={url:'https://cloudkms.googleapis.com',provider:true,methods:['GET','POST'],pathPattern:`^/v1/(?:${versions.map(escape).join('|')})(?::asymmetricSign|:encrypt|:decrypt)?$`,callers:['relay-origin']};
 return {principals,routes,signingKeys:{evidence:keys.evidence,'federation-delivery':keys.delivery,passport:keys.passport}};
}
/** Apply in each isolated synthetic database using its operator/owner connection.
 * Runtime roles get no CREATE, ownership, role membership or fq_control access. */
export function workerGrants(component){
 if(!['myeve','peer','relay'].includes(component))throw Error('Synthetic component required');
 const db=`fq_${component}_6384519e0e01`,role=`${db}_worker`;
 const permissions=component==='relay'?`GRANT SELECT,UPDATE ON federation_requests TO ${role}; GRANT SELECT,DELETE ON federation_rate_windows TO ${role};`:`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}; REVOKE INSERT,UPDATE,TRUNCATE ON myeve_relay_artifacts FROM ${role};`;
 return `DO $$ BEGIN IF current_database()<>'${db}' THEN RAISE EXCEPTION 'wrong synthetic database'; END IF; END $$;
CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4;
GRANT CONNECT ON DATABASE ${db} TO ${role};
GRANT USAGE ON SCHEMA public TO ${role};
${permissions}`;
}
