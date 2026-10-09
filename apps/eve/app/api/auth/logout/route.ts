import { NextResponse } from "next/server";

import {
  LEGACY_WEB_SESSION_COOKIE,
  requireSameOrigin,
  revokeWebSession,
  WEB_SESSION_COOKIE,
} from "@/lib/web-auth";

export async function POST(request: Request): Promise<Response> {
  const crossOrigin = requireSameOrigin(request);
  if (crossOrigin) return crossOrigin;
  try {
    await revokeWebSession(request);
  } catch {
    return NextResponse.json({ error: "Sign-out could not be confirmed. Try again." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "no-store");
  for (const name of [WEB_SESSION_COOKIE, LEGACY_WEB_SESSION_COOKIE]) {
    response.cookies.set({
      name,
      value: "",
      expires: new Date(0),
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}
