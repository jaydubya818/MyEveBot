import {digest} from './contract.ts';
import type {FactoryRuntime} from './factory-routing.ts';

// Read-only credential renewal cannot change frozen execution authority.
export function factoryExecutionConfigurationHash(config: FactoryRuntime) {
 const {evidence,...rawConnection}=config.connection;
 const {authorizationEnvelopeSha256:_,...connection}=rawConnection as typeof rawConnection & {authorizationEnvelopeSha256?:string};
 return digest({...config,connection:{...connection,...(evidence?{evidence:{ownerScope:evidence.ownerScope}}:{})}});
}

