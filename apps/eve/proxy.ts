import {cloudRuntimeEnabled,cloudIngressAllowed} from './lib/engineering/cloud-runtime-guard';
import { cloudQualificationProject } from "./lib/engineering/cloud-access-qualification";
import { qualificationEnabled, qualifyIngress } from "./lib/qualification/client";
import { externalAlphaIngress } from "./lib/external-alpha/features";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { webAuthConfigStatus, webAuthRequired, authenticateWebPrincipal } from "@/lib/web-auth";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // An external-alpha installation serves only its explicit allowlist. This runs
  // before every other branch so no qualification or ingress shortcut can reach
  // an unclassified or denied route. Anything not listed is a plain 404.
  const alphaIngress = externalAlphaIngress(request.nextUrl.pathname, request.method);
  if (alphaIngress && !alphaIngress.allowed) return new NextResponse(null, { status: 404 });
  // The dedicated preview exposes only the deterministic, authenticated journey.
  // An absent installation flag keeps every productive entry closed.
  if (cloudQualificationProject()) {
    if (process.env.VERCEL_ENV === "preview" && request.nextUrl.pathname === "/api/cloud-qualification/access") return NextResponse.next();
    if(!cloudRuntimeEnabled()||!cloudIngressAllowed(request.nextUrl.pathname,request.method))return new NextResponse(null,{status:403});
    // Continue through existing web/session and endpoint authentication below.
  }
  if (qualificationEnabled()) {
    if(request.nextUrl.pathname === "/api/relay/qualification-artifacts") return NextResponse.next();
    try { await qualifyIngress(request, /^\/api\/relay\/artifacts\/[^/]+$/); return NextResponse.next(); }
    catch { return new NextResponse(null, {status:403}); }
  }
  if (/^\/(?:api|eve\/v1|login|_next\/static|_next\/image|favicon\.ico)/.test(request.nextUrl.pathname) || request.nextUrl.pathname.includes(".")) return NextResponse.next();
  if (!webAuthRequired()) return NextResponse.next();
  if ((await authenticateWebPrincipal(request)) !== null) return NextResponse.next();

  const login = new URL("/login", request.url);
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  login.searchParams.set("returnTo", returnTo);
  if (!webAuthConfigStatus().configured) login.searchParams.set("setup", "required");
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/:path*"],
};
