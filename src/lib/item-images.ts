import { one, q } from "./db";
import { loadAsset, processImage, saveAsset, type Processed } from "./assets";
import { editImage } from "./images";
import { dropAsset, snapshot } from "./versions";
import { InsufficientFunds, PRICES, charge, refund } from "./wallet";

type Result = { ok: true; note?: string } | { ok: false; error: string };
export const OWN_IMAGE_MAX = 4 * 1024 * 1024;

/** Файл из формы → обработанное изображение (перекодируется, метаданные вырезаются). null — файл не выбран. */
export async function readUpload(v: FormDataEntryValue | null): Promise<{ p: Processed; name: string } | null> {
  if (!(v instanceof File) || !v.size) return null;
  if (v.size > OWN_IMAGE_MAX) throw new Error("Изображение больше 4 МБ. Выберите файл поменьше");
  const p = await processImage(Buffer.from(await v.arrayBuffer()), "generated");
  return { p, name: (v.name || "image").replace(/\.[a-z0-9]+$/i, "").slice(0, 60) + ".jpg" };
}

/** Сохраняет своё изображение как самостоятельный файл (для форм создания и автоленты), возвращает id. */
export async function saveStandalone(orgId: string, brandId: string | null, v: FormDataEntryValue | null): Promise<string | null> {
  const up = await readUpload(v);
  return up ? saveAsset(orgId, brandId, "generated", up.name, up.p, "своё изображение") : null;
}

/** Копия файла для материала: у каждого материала своя запись, чтобы удаление одного не ломало другие. */
export async function copyAssetToItem(orgId: string, assetId: string, itemId: string): Promise<boolean> {
  const a = await loadAsset(orgId, assetId);
  if (!a) return false;
  const brand = await one<{ brand_id: string }>("select brand_id from kz_content_items where id=$1 and org_id=$2", [itemId, orgId]);
  if (!brand) return false;
  const id = await saveAsset(orgId, brand.brand_id, "generated", a.name, { data: a.data, mime: a.mime, width: a.width, height: a.height }, "своё изображение");
  const old = await one<{ image_id: string | null }>("select image_id from kz_content_items where id=$1", [itemId]);
  await q("update kz_content_items set image_id=$2, meta = (meta - 'imageError') || jsonb_build_object('imageOwn', true), updated_at=now() where id=$1", [itemId, id]);
  if (old?.image_id) await dropAsset(orgId, old.image_id);
  return true;
}

/** Картинка, прикреплённая вручную к уже существующему материалу. */
export async function attachOwnImage(orgId: string, itemId: string, v: FormDataEntryValue | null): Promise<Result> {
  const it = await one<{ brand_id: string; image_id: string | null }>("select brand_id,image_id from kz_content_items where id=$1 and org_id=$2 and status not in ('published')", [itemId, orgId]);
  if (!it) return { ok: false, error: "Материал недоступен" };
  let id: string | null;
  try { id = await saveStandalone(orgId, it.brand_id, v); } catch (e) { return { ok: false, error: (e as Error).message }; }
  if (!id) return { ok: false, error: "Выберите файл изображения" };
  await q("update kz_content_items set image_id=$2, meta = (meta - 'imageError') || jsonb_build_object('imageOwn', true), updated_at=now() where id=$1", [itemId, id]);
  if (it.image_id) await dropAsset(orgId, it.image_id);
  return { ok: true };
}

const HOW: Record<string, string | undefined> = { redraw: "ИИ пересоздал изображение по мотивам вашего: эта модель не умеет точную правку." };

/** Доработка изображения материала ИИ по пожеланию. Платно как картинка, при сбое возврат. Результат заменяет прежнее изображение. */
export async function reworkItemImage(orgId: string, itemId: string, instruction: string): Promise<Result> {
  const ins = instruction.trim().slice(0, 400);
  if (ins.length < 3) return { ok: false, error: "Опишите, что изменить в изображении" };
  await snapshot(orgId, itemId, "до доработки картинки");
  const it = await one<{ brand_id: string; image_id: string | null; topic: string }>("select brand_id,image_id,topic from kz_content_items where id=$1 and org_id=$2 and status not in ('published')", [itemId, orgId]);
  if (!it?.image_id) return { ok: false, error: "У материала нет изображения. Сначала прикрепите своё или создайте картинку" };
  const a = await loadAsset(orgId, it.image_id);
  if (!a) return { ok: false, error: "Изображение не найдено" };
  const aspect = a.width > a.height * 1.2 ? "landscape" : a.height > a.width * 1.2 ? "portrait" : "square";
  try { await charge(orgId, PRICES.image, `Доработка изображения: ${it.topic.slice(0, 50)}`, itemId); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const r = await editImage(a.data, a.mime, ins, aspect);
    const p = await processImage(r.data, "generated");
    const id = await saveAsset(orgId, it.brand_id, "generated", `${it.topic.slice(0, 50)}.jpg`, p, "доработано ИИ");
    await q("update kz_content_items set image_id=$2, meta = (meta - 'imageError') || jsonb_build_object('imageOwn', true, 'imagePrompt', $3::text), updated_at=now() where id=$1", [itemId, id, ins]);
    await dropAsset(orgId, it.image_id);
    return { ok: true, note: HOW[r.how] };
  } catch (e) {
    await refund(orgId, PRICES.image, "ошибка доработки изображения", itemId);
    return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` };
  }
}

/* ───── автолента: изображение лежит в классификации записи, пока материал не создан ───── */

export async function flowImageId(orgId: string, flowItemId: string): Promise<string | null> {
  const r = await one<{ id: string | null }>("select classification->>'imageId' id from kz_flow_items where id=$1 and org_id=$2", [flowItemId, orgId]);
  return r?.id ?? null;
}

const setFlowImage = (orgId: string, flowItemId: string, assetId: string | null) =>
  q(`update kz_flow_items set classification = case when $3::text is null then coalesce(classification,'{}'::jsonb) - 'imageId' else coalesce(classification,'{}'::jsonb) || jsonb_build_object('imageId',$3::text) end, updated_at=now()
      where id=$1 and org_id=$2 and status in ('pending','ready','failed')`, [flowItemId, orgId, assetId]);

export async function attachFlowImage(orgId: string, flowItemId: string, v: FormDataEntryValue | null): Promise<Result> {
  const fi = await one<{ brand_id: string }>("select f.brand_id from kz_flow_items i join kz_flows f on f.id=i.flow_id where i.id=$1 and i.org_id=$2 and i.status in ('pending','ready','failed')", [flowItemId, orgId]);
  if (!fi) return { ok: false, error: "Запись недоступна" };
  let id: string | null;
  try { id = await saveStandalone(orgId, fi.brand_id, v); } catch (e) { return { ok: false, error: (e as Error).message }; }
  if (!id) return { ok: false, error: "Выберите файл изображения" };
  const old = await flowImageId(orgId, flowItemId);
  await setFlowImage(orgId, flowItemId, id);
  if (old) await q("delete from kz_assets where id=$1 and org_id=$2", [old, orgId]);
  return { ok: true };
}

export async function removeFlowImage(orgId: string, flowItemId: string): Promise<void> {
  const old = await flowImageId(orgId, flowItemId);
  await setFlowImage(orgId, flowItemId, null);
  if (old) await q("delete from kz_assets where id=$1 and org_id=$2", [old, orgId]);
}

export async function reworkFlowImage(orgId: string, flowItemId: string, instruction: string): Promise<Result> {
  const ins = instruction.trim().slice(0, 400);
  if (ins.length < 3) return { ok: false, error: "Опишите, что изменить в изображении" };
  const old = await flowImageId(orgId, flowItemId);
  const fi = await one<{ brand_id: string }>("select f.brand_id from kz_flow_items i join kz_flows f on f.id=i.flow_id where i.id=$1 and i.org_id=$2", [flowItemId, orgId]);
  if (!old || !fi) return { ok: false, error: "Сначала прикрепите изображение" };
  const a = await loadAsset(orgId, old);
  if (!a) return { ok: false, error: "Изображение не найдено" };
  const aspect = a.width > a.height * 1.2 ? "landscape" : a.height > a.width * 1.2 ? "portrait" : "square";
  try { await charge(orgId, PRICES.image, "Доработка изображения (автолента)", flowItemId); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const r = await editImage(a.data, a.mime, ins, aspect);
    const id = await saveAsset(orgId, fi.brand_id, "generated", "автолента.jpg", await processImage(r.data, "generated"), "доработано ИИ");
    await setFlowImage(orgId, flowItemId, id);
    await q("delete from kz_assets where id=$1 and org_id=$2", [old, orgId]);
    return { ok: true, note: HOW[r.how] };
  } catch (e) {
    await refund(orgId, PRICES.image, "ошибка доработки изображения", flowItemId);
    return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` };
  }
}

/** Одно загруженное изображение — ко всем создаваемым материалам (у каждого своя запись). Картинка идёт только к тем форматам, где она публикуется. */
export const IMAGE_KINDS = ["post", "article", "story", "seo", "contest"];
export async function attachUploadToItems(orgId: string, brandId: string, v: FormDataEntryValue | null, items: { id: string; kind: string }[]): Promise<string | null> {
  let up: Awaited<ReturnType<typeof readUpload>>;
  try { up = await readUpload(v); } catch (e) { return (e as Error).message; }
  if (!up) return null;
  try {
    for (const it of items.filter((x) => IMAGE_KINDS.includes(x.kind))) {
      const id = await saveAsset(orgId, brandId, "generated", up.name, up.p, "своё изображение");
      await q("update kz_content_items set image_id=$2, meta = meta || jsonb_build_object('imageOwn', true), updated_at=now() where id=$1 and org_id=$3", [it.id, id, orgId]);
    }
  } catch (e) { return (e as Error).message; }
  return null;
}
