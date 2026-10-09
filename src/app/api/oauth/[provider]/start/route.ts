import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { PROVIDERS, authorizeUrl, configured, newPkce, type Provider } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const home = (e: string) => NextResponse.redirect(new URL(`/login?error=${e}`, req.url));
  if (!PROVIDERS.includes(provider as Provider)) return home("provider");
  const p = provider as Provider;
  if (!configured(p)) return home("not_configured");
  const state = randomBytes(24).toString("hex");
  const pkce = newPkce();
  const res = NextResponse.redirect(authorizeUrl(req, p, state, pkce.challenge));
  // state и PKCE-verifier в httpOnly-cookie: callback принимает только запрос, начатый из этого же браузера (защита от CSRF и перехвата кода)
  res.cookies.set("lt_oauth_state", `${p}.${state}.${pkce.verifier}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/oauth", maxAge: 600 });
  return res;
}
