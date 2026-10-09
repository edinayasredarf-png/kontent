import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sessionCookie } from "@/lib/auth";
import { PROVIDERS, configured, fetchProfile, resolveUser, type Provider } from "@/lib/oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const fail = (e: string) => { const r = NextResponse.redirect(new URL(`/login?error=${e}`, req.url)); r.cookies.delete({ name: "lt_oauth_state", path: "/api/oauth" }); return r; };
  if (!PROVIDERS.includes(provider as Provider) || !configured(provider as Provider)) return fail("provider");
  const p = provider as Provider;
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return fail("denied"); // пользователь отказался на стороне провайдера
  const code = sp.get("code") ?? "", state = sp.get("state") ?? "";
  const saved = req.cookies.get("lt_oauth_state")?.value ?? "";
  if (!code || !state || !same(saved, `${p}.${state}`)) return fail("state");
  try {
    const prof = await fetchProfile(req, p, code);
    const s = await resolveUser(p, prof, req.cookies.get("lt_ref")?.value);
    const res = NextResponse.redirect(new URL("/app", req.url));
    res.cookies.set(await sessionCookie(s));
    res.cookies.delete({ name: "lt_oauth_state", path: "/api/oauth" });
    return res;
  } catch (e) {
    console.error("[oauth]", p, (e as Error).message);
    return fail("failed");
  }
}
