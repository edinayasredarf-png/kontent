import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { readSession, loadWriterOrNull } from "@/lib/auth";
import { connectUrl, newPkce, vkConnectConfigured } from "@/lib/vk-connect";

export const dynamic = "force-dynamic";

/** Начало личного подключения VK: только вошедший пользователь с правом записи. state и PKCE-verifier — в httpOnly-cookie, привязанной к пользователю и организации. */
export async function GET(req: NextRequest) {
  const back = (e: string) => NextResponse.redirect(new URL(`/app/channels?vk=${e}`, req.url));
  const s = await readSession();
  if (!s) return NextResponse.redirect(new URL("/login", req.url));
  if (!(await loadWriterOrNull(s))) return back("forbidden");
  if (!vkConnectConfigured()) return back("not_configured");
  const state = randomBytes(24).toString("hex"), pkce = newPkce();
  const res = NextResponse.redirect(connectUrl(req, state, pkce.challenge));
  res.cookies.set("lt_vk_connect", `${state}.${pkce.verifier}.${s.uid}.${s.org}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/vk/connect", maxAge: 600 });
  return res;
}
