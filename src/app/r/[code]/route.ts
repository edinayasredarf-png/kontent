import { NextRequest, NextResponse } from "next/server";

/** Партнёрская ссылка: запоминаем код на 30 дней и ведём на регистрацию. Код проверяется при создании аккаунта. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const res = NextResponse.redirect(new URL("/register", req.url));
  if (/^[a-z0-9]{6,12}$/.test(code)) res.cookies.set("lt_ref", code, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
