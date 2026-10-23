import { NextRequest, NextResponse } from "next/server";
import { guestByToken } from "@/lib/guest";
import { sessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Гостевая ссылка: без регистрации, только просмотр. Ставим сессию служебного наблюдателя и ведём в кабинет. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await guestByToken(token);
  const base = process.env.APP_URL || req.nextUrl.origin;
  if (!g) return NextResponse.redirect(new URL("/login?guest=expired", base), 303);
  const res = NextResponse.redirect(new URL("/app/overview", base), 303);
  const c = await sessionCookie({ uid: g.userId, org: g.orgId });
  res.cookies.set(c.name, c.value, { httpOnly: c.httpOnly, sameSite: c.sameSite, secure: c.secure, path: c.path, maxAge: c.maxAge });
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
