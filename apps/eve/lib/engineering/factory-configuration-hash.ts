import {digest} from './contract.ts';
import type {FactoryRuntime} from './factory-routing.ts';

// Read-only credential renewal cannot change frozen execution authority.
export function factoryExecutionConfigurationHash(config: FactoryRuntime,
 installed?: Pick<FactoryRuntime['engineering'], 'objective' | 'criteria'>) {
 const {evidence,...rawConnection}=config.connection;
 const {authorizationEnvelopeSha256:_,...connection}=rawConnection as typeof rawConnection & {authorizationEnvelopeSha256?:string};
 const engineering = installed ? {...config.engineering,objective:installed.objective,criteria:installed.criteria} : config.engineering;
 return digest({...config,engineering,connection:{...connection,...(evidence?{evidence:{ownerScope:evidence.ownerScope}}:{})}});
}

