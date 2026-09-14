import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { webAuthConfigStatus, webAuthRequired, webPrincipal } from "@/lib/web-auth";

export function proxy(request: NextRequest): NextResponse {
  if (!webAuthRequired()) return NextResponse.next();
  if (webPrincipal(request) !== null) return NextResponse.next();

  const login = new URL("/login", request.url);
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  login.searchParams.set("returnTo", returnTo);
  if (!webAuthConfigStatus().configured) login.searchParams.set("setup", "required");
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api|eve/v1|login|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
