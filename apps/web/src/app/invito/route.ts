import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

const INVITE_COOKIE = "cos_invite";

/**
 * Link d'invito: sposta il token dall'URL a un cookie httpOnly (24 ore) e
 * reindirizza, così il token non resta in cronologia, log o referrer.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const response = NextResponse.redirect(new URL("/invito/conferma", env().APP_URL));
  if (/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    response.cookies.set(INVITE_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/invito",
      maxAge: 86_400,
    });
  }
  return response;
}
