import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** These are the current owner-journey production-build seams, with a stricter
 * local transport and an explicitly pinned local font to avoid a build fetch.
 * The positive Work runner, grants, profiles and assertions remain unchanged. */
export function currentQESeams(sourceRoot,font){
 assert.equal(hash(readFileSync(join(sourceRoot,'apps/eve/test/owner-journey/runner-prod.ts'))),'bec2aca119165484fab742e1537b436a2f702dcecb820c44142c03983d18e6e4','QE_RUNNER_PROFILE_CHANGED');
 assert.equal(hash(readFileSync(join(sourceRoot,'apps/eve/test/owner-journey/gateway.ts'))),'cee51d550aa8b8830351dea38e13270d29150532cbfba0877f63e8bc0a8317fd','QE_GATEWAY_PROFILE_CHANGED');
 assert.equal(hash(font),'bde046ddd9f20be35b0bd56cc79eb752b967fb6661a3fe76cb067bb09f871d76','QE_FONT_BODY');
 const app='apps/eve/',modelPath=app+'lib/external-alpha/model.ts',layoutPath=app+'app/layout.tsx';
 const model=readFileSync(join(sourceRoot,modelPath),'utf8');
 const from='import { gateway } from "ai";';assert.equal(model.split(from).length,2,'QE_MODEL_SEAM_CHANGED');
 const layout=readFileSync(join(sourceRoot,layoutPath),'utf8');
 // Exact existing R9 local-font seam, no application UI or behavior replacement.
 const fontImport='import { Geist, Geist_Mono, Inter } from "next/font/google";';
 assert.equal(layout.split(fontImport).length,2,'QE_LAYOUT_IMPORT_SEAM_CHANGED');
 const fontDeclarations=layout.slice(layout.indexOf('const inter = Inter('),layout.indexOf('export const metadata:'));
 assert(fontDeclarations.startsWith('const inter = Inter(')&&fontDeclarations.includes('const geistMono = Geist_Mono('),'QE_LAYOUT_FONT_SEAM_CHANGED');
 const localDeclarations=['const inter = localFont({ src: "../test/owner-chat-only/fixture-geist-regular.ttf", variable: "--font-sans" });',
  'const geist = localFont({ src: "../test/owner-chat-only/fixture-geist-regular.ttf", variable: "--font-geist" });',
  'const geistMono = localFont({ src: "../test/owner-chat-only/fixture-geist-regular.ttf", variable: "--font-geist-mono" });','',''].join('\n');
 const transport=projectCurrentQETransport(readFileSync(join(sourceRoot,app+'test/owner-chat-only/transport.cjs'),'utf8'));
 const bodies={
  [modelPath]:Buffer.from(model.replace(from,'import { gateway } from "../../test/owner-journey/gateway.ts";')),
  [app+'next.config.ts']:Buffer.from("export default {serverExternalPackages:['@remotion/bundler','@remotion/renderer','heif2jpeg'],async rewrites(){return [{source:'/eve/:path*',destination:'http://127.0.0.1:3185/eve/:path*'}]}};\n"),
  [layoutPath]:Buffer.from(layout.replace(fontImport,'import localFont from "next/font/local";').replace(fontDeclarations,localDeclarations)),
  [app+'test/owner-chat-only/fixture-geist-regular.ttf']:font,
  [app+'test/owner-journey/transport.cjs']:Buffer.from(transport),
 };
 return Object.entries(bodies).map(([path,body])=>{
  let beforeSha256=null;try{beforeSha256=hash(readFileSync(join(sourceRoot,path)));}catch(error){if(error.code!=='ENOENT')throw error;}
  return {path,beforeSha256,afterSha256:hash(body),bodyBase64:body.toString('base64')};
 });
}

export function projectCurrentQETransport(source){
 const webGuard='  if (!web.has(url.origin)) return false;';assert.equal(source.split(webGuard).length,2,'QE_PROXY_TRANSPORT_SEAM_CHANGED');
 return source.replace(webGuard,webGuard+"\n  if (/^\\/eve\\/v1\\/(health|info|session(?:\\/[^/]+)?(?:\\/stream)?)$/.test(url.pathname)) return ['GET','HEAD','POST'].includes(method);");
}
