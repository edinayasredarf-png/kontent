import { one, q } from "./db";

/** Версии материала: перед каждой правкой чата или карточки сохраняются текст и картинка, любую можно вернуть. Без миграции 032 всё молча отключается. */
export interface Version { id: string; at: string; note: string; hasImage: boolean; chars: number }
const KEEP = 10;

export async function snapshot(orgId: string, itemId: string, note: string): Promise<void> {
  try {
    const it = await one<{ body: string; image_id: string | null }>("select body,image_id from kz_content_items where id=$1 and org_id=$2", [itemId, orgId]);
    if (!it) return;
    const last = await one<{ body: string; image_id: string | null }>("select body,image_id from kz_item_versions where item_id=$1 order by created_at desc limit 1", [itemId]);
    if (last && last.body === it.body && last.image_id === it.image_id) return; // ничего не изменилось с прошлой копии
    await q("insert into kz_item_versions(org_id,item_id,body,image_id,note) values($1,$2,$3,$4,$5)", [orgId, itemId, it.body, it.image_id, note.slice(0, 80)]);
    const old = await q<{ id: string; image_id: string | null }>("select id,image_id from kz_item_versions where item_id=$1 order by created_at desc offset $2", [itemId, KEEP]);
    for (const v of old) {
      await q("delete from kz_item_versions where id=$1", [v.id]);
      if (v.image_id) await dropAsset(orgId, v.image_id);
    }
  } catch { /* нет таблицы или сбой: версии необязательны */ }
}

/** Удаляет картинку, только если она не нужна ни материалу, ни сохранённой версии. */
export async function dropAsset(orgId: string, assetId: string | null): Promise<void> {
  if (!assetId) return;
  const used = await one("select 1 from kz_item_versions where image_id=$1 union all select 1 from kz_content_items where image_id=$1", [assetId]).catch(() => null);
  if (!used) await q("delete from kz_assets where id=$1 and org_id=$2", [assetId, orgId]).catch(() => {});
}

export async function listVersions(orgId: string, itemId: string): Promise<Version[]> {
  const rows = await q<{ id: string; at: string; note: string; image_id: string | null; chars: number }>(
    "select id,created_at at,note,image_id,length(body) chars from kz_item_versions where item_id=$1 and org_id=$2 order by created_at desc limit 10", [itemId, orgId]).catch(() => []);
  return rows.map((r) => ({ id: r.id, at: r.at, note: r.note, hasImage: !!r.image_id, chars: r.chars }));
}

export async function restoreVersion(orgId: string, itemId: string, versionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = await one<{ body: string; image_id: string | null }>("select body,image_id from kz_item_versions where id=$1 and item_id=$2 and org_id=$3", [versionId, itemId, orgId]).catch(() => null);
  if (!v) return { ok: false, error: "Версия не найдена" };
  const it = await one<{ status: string }>("select status from kz_content_items where id=$1 and org_id=$2", [itemId, orgId]);
  if (!it) return { ok: false, error: "Материал не найден" };
  if (it.status === "published") return { ok: false, error: "Материал уже опубликован: его нельзя изменить" };
  await snapshot(orgId, itemId, "до возврата версии");
  const imgOk = v.image_id ? await one("select 1 from kz_assets where id=$1 and org_id=$2", [v.image_id, orgId]) : null;
  await q("update kz_content_items set body=$3, image_id=case when $4::uuid is not null then $4::uuid else image_id end, meta = meta - 'imageRawId' - 'imageRawFor', updated_at=now() where id=$1 and org_id=$2", [itemId, orgId, v.body, imgOk ? v.image_id : null]);
  return { ok: true };
}
