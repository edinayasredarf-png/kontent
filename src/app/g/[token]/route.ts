import { NextRequest, NextResponse } from "next/server";
import { guestByToken } from "@/lib/guest";
import { readSession, sessionCookie, validSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Гостевая ссылка: без регистрации, только просмотр. Ставим сессию служебного наблюдателя и ведём в кабинет. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await guestByToken(token);
  const base = process.env.APP_URL || req.nextUrl.origin;
  if (!g) return NextResponse.redirect(new URL("/login?guest=expired", base), 303);
  const active = await readSession(false);
  if (active && await validSession(active)) {
    const destination = active.org === g.orgId ? "/app/overview" : "/login?guest=active";
    const res = NextResponse.redirect(new URL(destination, base), 303);
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  const res = NextResponse.redirect(new URL("/app/overview", base), 303);
  const c = await sessionCookie({ uid: g.userId, org: g.orgId }, g.expiresAt);
  if (active) res.cookies.delete("lt_session");
  res.cookies.set(c);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
