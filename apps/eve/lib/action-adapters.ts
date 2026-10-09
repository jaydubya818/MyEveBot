import { createHash } from "node:crypto";
import { posix } from "node:path";
import { consumeActionAuthority, type ActionAdapter, type ActionTarget, type AuthorizedAction } from "./action-gateway.ts";

export interface EmailProvider {
  resolveAccount():Promise<string>;
  send(parameters:Record<string,unknown>,context:AuthorizedAction):Promise<{messageId:string;threadId:string}>;
  inspect(account:string,messageId:string):Promise<{messageId:string;threadId:string;account:string}|null>;
}

/** Explicit provider-neutral email operation. No dynamic tool-name inference. */
export function emailSendAdapter(providerName:string,provider:EmailProvider):ActionAdapter<{messageId:string;threadId:string}> {
  return {
    async resolveTarget(parameters) {
      const recipients=["to","cc","bcc"].map(key=>{
        const values=parameters[key]??[];
        if(!Array.isArray(values) || values.some(v=>typeof v!=="string" || !/^[^\s@]+@[^\s@]+$/.test(v)))throw new Error("Invalid recipients");
        return [key,[...values].sort()];
      });
      if(!(parameters.to as unknown[])?.length)throw new Error("Missing recipient");
      return {provider:providerName,account:await provider.resolveAccount(),resource:JSON.stringify(recipients)};
    },
    async execute(parameters,context) {
      await consumeActionAuthority(context,parameters,"tool.send_email");
      return provider.send(parameters,context);
    },
    receipt:result=>({messageId:result.messageId,threadId:result.threadId}),
    async verify(result,target) {
      const message=result.messageId?await provider.inspect(target.account,result.messageId):null;
      return {verified:!!message && message.account===target.account && message.messageId===result.messageId && message.threadId===result.threadId,
        receipt:{messageId:result.messageId,threadId:result.threadId,verified:!!message}};
    },
  };
}

export interface FileProvider {
  id:string;
  canonicalPath(path:string):Promise<string>;
  write(parameters:Record<string,unknown>,context:AuthorizedAction):Promise<unknown>;
  read(path:string):Promise<string|null>;
}
export function fileWriteAdapter(provider:FileProvider):ActionAdapter<{path:string;checksum:string}> {
  return {
    async resolveTarget(parameters):Promise<ActionTarget> {
      if(typeof parameters.filePath!=="string" || typeof parameters.content!=="string")throw new Error("Invalid file write");
      const path=posix.normalize(parameters.filePath);
      if(!path.startsWith("/workspace/") || path.includes("\0"))throw new Error("Path outside workspace");
      const real=await provider.canonicalPath(path);
      if(real!==path)throw new Error("Symlink or ambiguous file target");
      return {provider:"sandbox",account:provider.id,resource:path,environment:"workspace"};
    },
    async execute(parameters,context) {
      await consumeActionAuthority(context,parameters,"files.write");
      if(context.target.account!==provider.id || await provider.canonicalPath(context.target.resource)!==context.target.resource)throw new Error("File target changed");
      await provider.write({...parameters,filePath:context.target.resource},context);
      return {path:context.target.resource,checksum:createHash("sha256").update(String(parameters.content)).digest("hex")};
    },
    receipt:result=>result,
    async verify(result,target) {
      const content=await provider.read(target.resource);
      const checksum=content===null?null:createHash("sha256").update(content).digest("hex");
      return {verified:checksum===result.checksum,receipt:{path:result.path,checksum,expectedChecksum:result.checksum}};
    },
  };
}
