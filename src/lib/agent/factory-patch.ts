import { one, q } from "../db";
import { cleanLink, cleanSettings, EMOJI, HASHTAGS, LENGTHS } from "../postsettings";

const UUID = /^[0-9a-f-]{36}$/i;

export interface FactoryPatch { status?: "active" | "paused"; autopublish?: boolean; approval?: "manual" | "auto"; images?: boolean; channelIds?: string[]; length?: string; emoji?: string; hashtags?: string; cta?: string; link?: string }

/** Настройки завода из чата: сохраняется ровно то же, что на странице завода (тумблеры, каналы, параметры текста). */
export async function saveFactoryPatch(orgId: string, id: string, p: FactoryPatch): Promise<{ ok: boolean; error?: string; note?: string }> {
  const c = { org: { id: orgId } };
  const f = await one<{ brand_id: string; brief: unknown }>("select brand_id,brief from kz_factories where id=$1 and org_id=$2", [id, c.org.id]);
  if (!f) return { ok: false, error: "Завод не найден" };
  const sets: string[] = [], vals: unknown[] = [id, c.org.id];
  const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  if (p.status === "active" || p.status === "paused") set("status", p.status);
  if (typeof p.autopublish === "boolean") set("autopublish", p.autopublish);
  if (p.approval === "manual" || p.approval === "auto") set("approval", p.approval);
  if (Array.isArray(p.channelIds)) {
    const ok = await q<{ id: string }>("select id from kz_channels where org_id=$1 and brand_id=$2 and id = any($3::uuid[])", [c.org.id, f.brand_id, p.channelIds.map(String).filter((x) => UUID.test(x))]);
    set("channel_ids", ok.map((x) => x.id));
  }
  // параметры текста и картинки лежат в brief: сливаем и проверяем тем же разбором, что и форма настроек
  const patch: Record<string, unknown> = {};
  if (typeof p.images === "boolean") patch.images = p.images;
  const cur = cleanSettings(f.brief) as unknown as Record<string, unknown>;
  const upd: Record<string, unknown> = {};
  if (p.length && p.length in LENGTHS) upd.length = p.length;
  if (p.emoji && p.emoji in EMOJI) upd.emoji = p.emoji;
  if (p.hashtags && p.hashtags in HASHTAGS) upd.hashtags = p.hashtags;
  if (typeof p.cta === "string") upd.cta = p.cta;
  if (typeof p.link === "string") { const l = cleanLink(p.link); if (p.link.trim() && !l) return { ok: false, error: "Ссылка должна быть адресом сайта (http:// или https://)" }; upd.link = l; }
  if (Object.keys(upd).length) {
    const next = cleanSettings({ ...cur, ...upd });
    const { learnings: _l, strategy: _s, rubricNote: _r, ...persist } = next; void _l; void _s; void _r;
    Object.assign(patch, persist);
  }
  if (Object.keys(patch).length) { vals.push(JSON.stringify(patch)); sets.push(`brief = brief || $${vals.length}::jsonb`); }
  if (!sets.length) return { ok: true };
  await q(`update kz_factories set ${sets.join(", ")} where id=$1 and org_id=$2`, vals);
  return { ok: true, note: "Сохранено" };
}

