import { PublishError, type Provider } from "./types";
import { safeRequest } from "../safefetch";

/** credentials: target — адрес сайта, token — «логин:пароль приложения» (WordPress → Пользователи → Профиль → Пароли приложений), status — draft | publish. */
function conf(c: Record<string, string>) {
  let site = (c.target ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(site)) site = `https://${site}`;
  if (!c.token?.includes(":")) throw new PublishError("Для WordPress нужны логин и пароль приложения");
  return { site, auth: "Basic " + Buffer.from(c.token).toString("base64"), status: c.status === "publish" ? "publish" : "draft" };
}

async function wp(site: string, auth: string, path: string, init: { method: string; headers?: Record<string, string>; body?: Uint8Array | string }) {
  let r: { status: number; text: string };
  try { r = await safeRequest(`${site}/wp-json/wp/v2${path}`, { ...init, headers: { Authorization: auth, Accept: "application/json", ...(init.headers ?? {}) }, timeoutMs: 40_000 }); }
  catch (e) { throw new PublishError(`Сайт недоступен: ${(e as Error).message}`, true); }
  if (r.status === 401 || r.status === 403) throw new PublishError("WordPress отклонил логин или пароль приложения (или у пользователя нет прав публиковать)");
  if (r.status === 404) throw new PublishError("REST API WordPress не найден — проверьте адрес сайта и что REST не отключён плагином безопасности");
  let j: unknown = {}; try { j = JSON.parse(r.text); } catch { /* не JSON */ }
  if (r.status >= 400) throw new PublishError(`WordPress ${r.status}: ${String((j as { message?: string })?.message ?? r.text).slice(0, 200)}`, r.status >= 500 || r.status === 429);
  return j as Record<string, unknown>;
}

export const wordpress: Provider = {
  kind: "wordpress",
  async verify(c) {
    const { site, auth } = conf(c);
    const me = await wp(site, auth, "/users/me?context=edit", { method: "GET" });
    return `${new URL(site).hostname} (пользователь ${String(me.name ?? "?")})`;
  },
  async publish(input, c) {
    const { site, auth, status } = conf(c);
    const a = input.article;
    if (!a) throw new PublishError("В WordPress публикуются только SEO-статьи");
    let media: number | undefined, warning: string | undefined;
    if (input.image) {
      try {
        const m = await wp(site, auth, "/media", { method: "POST", headers: { "Content-Type": input.image.mime, "Content-Disposition": `attachment; filename="${a.slug}.jpg"` }, body: new Uint8Array(input.image.data) });
        media = Number(m.id) || undefined;
      } catch (e) { if ((e as PublishError).retryable) throw e; warning = `Обложка не загружена (${(e as Error).message}), статья опубликована без неё`; }
    }
    const post = await wp(site, auth, "/posts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: a.title, content: a.html, slug: a.slug, status, excerpt: a.description, ...(media ? { featured_media: media } : {}), meta: { _yoast_wpseo_metadesc: a.description, _yoast_wpseo_title: a.title } }),
    });
    return { externalId: String(post.id), url: typeof post.link === "string" ? post.link : null, warning: warning ?? (status === "draft" ? "Статья сохранена в WordPress как черновик (режим канала). Опубликуйте её на сайте" : undefined) };
  },
};
