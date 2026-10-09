import { NextRequest, NextResponse } from "next/server";
import { safeNext, sessionCookie } from "./auth";
import { appOrigin, configured, resolveUser, type Profile, type Provider } from "./oauth";

/**
 * Вход через виджет провайдера: браузер получил токен и передаёт его сюда, мы проверяем его у провайдера и выдаём сессию.
 * Защита от подделки запроса с чужого сайта: только JSON-POST с нашим Origin (кросс-доменный JSON браузер сначала проверяет
 * preflight-ом, на который мы не отвечаем разрешением). Данные аккаунта берутся из ответа провайдера, а не из тела запроса.
 */
export async function widgetLogin(req: NextRequest, p: Provider, getProfile: (token: string) => Promise<Profile>) {
  const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });
  if (!configured(p)) return fail("Этот способ входа не настроен", 404);
  const origin = req.headers.get("origin");
  if (!origin || origin !== appOrigin(req)) return fail("Запрос отклонён", 403);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail("Запрос отклонён", 415);
  let body: { access_token?: unknown; next?: unknown };
  try { body = await req.json(); } catch { return fail("Некорректный запрос", 400); }
  const token = typeof body.access_token === "string" ? body.access_token : "";
  if (token.length < 10 || token.length > 4096) return fail("Токен не получен", 400);
  try {
    const s = await resolveUser(p, await getProfile(token), req.cookies.get("lt_ref")?.value);
    const res = NextResponse.json({ ok: true, url: safeNext(body.next) });
    res.cookies.set(await sessionCookie(s));
    return res;
  } catch (e) {
    console.error(`[widget-login ${p}]`, (e as Error).message);
    return fail("Провайдер не подтвердил вход. Попробуйте ещё раз или войдите по паролю", 401);
  }
}
