import { qualificationEnabled, qualifyIngress } from "./lib/qualification/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { webAuthConfigStatus, webAuthRequired, webPrincipal } from "@/lib/web-auth";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (qualificationEnabled()) {
    if(request.nextUrl.pathname === "/api/relay/qualification-artifacts") return NextResponse.next();
    try { await qualifyIngress(request, /^\/api\/relay\/artifacts\/[^/]+$/); return NextResponse.next(); }
    catch { return new NextResponse(null, {status:403}); }
  }
  if (/^\/(?:api|eve\/v1|login|_next\/static|_next\/image|favicon\.ico)/.test(request.nextUrl.pathname) || request.nextUrl.pathname.includes(".")) return NextResponse.next();
  if (!webAuthRequired()) return NextResponse.next();
  if (webPrincipal(request) !== null) return NextResponse.next();

  const login = new URL("/login", request.url);
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  login.searchParams.set("returnTo", returnTo);
  if (!webAuthConfigStatus().configured) login.searchParams.set("setup", "required");
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/:path*"],
};
