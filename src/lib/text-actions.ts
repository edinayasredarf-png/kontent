"use server";
import { requireCtx, requireWriter } from "./auth";
import { q } from "./db";
import { aiEditText, isEditOp } from "./text-tools";

export async function aiEditTextAction(text: string, op: string, instruction?: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const c = await requireWriter();
  if (!isEditOp(String(op))) return { ok: false, error: "Неизвестная команда" };
  return aiEditText(c.org.id, String(text ?? ""), op as never, String(instruction ?? ""));
}

export interface NewsHit { id: string; title: string; body: string; source: string; at: string; url: string }

/** Поиск по ленте новостей организации (мониторинг и автолента): для выбора новости в основу материала. */
export async function searchNewsAction(query: string): Promise<{ ok: true; items: NewsHit[] } | { ok: false; error: string }> {
  const c = await requireCtx();
  const s = String(query ?? "").trim().replace(/[%_\\]/g, "\\$&").slice(0, 80);
  // ILIKE для кириллицы зависит от локали базы, поэтому перебираем регистры сами
  const cap = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const pats = s ? [...new Set([s, s.toLowerCase(), s.toUpperCase(), cap])].map((x) => `%${x}%`) : ["%"];
  try {
    const rows = await q<{ id: string; title: string; body: string; source: string; at: string; url: string }>(
      `select i.id,i.title,i.body,coalesce(nullif(sr.title,''),sr.ref,'') source,to_char(i.published_at,'DD.MM.YYYY') at,i.url
         from kz_feed_items i join kz_sources sr on sr.id=i.source_id
        where i.org_id=$1 and not i.excluded and i.status<>'dismissed' and (i.title ilike any($2::text[]) or i.body ilike any($2::text[]))
        order by i.published_at desc limit 20`, [c.org.id, pats]);
    return { ok: true, items: rows.map((r) => ({ ...r, body: r.body.slice(0, 1500) })) };
  } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 160) }; }
}
