"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { q } from "./db";
import { setItemChannels, discardDraft, draftPublishNow, draftToPlan, imageForDraft, publishReport, regenDraft, saveDraftBody } from "./drafts";
import { attachOwnImage, reworkItemImage } from "./item-images";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
type R = { ok: boolean; error?: string; note?: string };

/**
 * Возврат в окно созданного материала. ret — страница, откуда окно открыто (проверяем, что это наш /app/…), drafts — все материалы окна;
 * материал, который ушёл в план или удалён (removeId), из списка выпадает, а когда список пуст, окно закрывается.
 */
function back(f: FormData, r: R, removeId?: string): never {
  revalidatePath("/app", "layout");
  const ret = /^\/app\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_%.,-]*)?$/.test(s(f, "ret")) || s(f, "ret") === "/app/monitor" ? s(f, "ret") : "/app";
  const ids = s(f, "drafts").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x) && x !== removeId);
  const p = new URLSearchParams();
  if (ids.length) p.set("draft", ids.join(","));
  if (!r.ok && r.error) p.set("err", r.error); else if (r.note) p.set("note", r.note);
  redirect(`${ret}${p.size ? (ret.includes("?") ? "&" : "?") + p : ""}`);
}

export async function saveDraftTextAction(f: FormData) {
  const c = await requireWriter();
  back(f, await saveDraftBody(c.org.id, s(f, "id"), String(f.get("body") ?? "")));
}

/** Опрос в окне материала: вводный текст, вопрос, варианты (или открытый вопрос без вариантов), «несколько ответов». */
export async function saveDraftPollAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id");
  const question = s(f, "question").slice(0, 280);
  const open = s(f, "mode") === "open";
  const options = open ? [] : [...new Set(f.getAll("option").map((x) => String(x).trim().slice(0, 90)).filter(Boolean))].slice(0, 10);
  if (!question) return back(f, { ok: false, error: "Напишите вопрос опроса" });
  if (!open && options.length < 2) return back(f, { ok: false, error: "Нужно минимум два варианта ответа или выберите «Открытый вопрос»" });
  const poll = { question, options, mode: open ? "open" : "options", multi: !open && f.get("multi") === "on" };
  const r = await q("update kz_content_items set body=$3, meta = meta || jsonb_build_object('poll',$4::jsonb), updated_at=now() where id=$1 and org_id=$2 and kind='poll' and coalesce((meta->>'draft')::boolean,false) returning id", [id, c.org.id, String(f.get("body") ?? "").trim().slice(0, 4000), JSON.stringify(poll)]);
  back(f, r.length ? { ok: true } : { ok: false, error: "Опрос не найден" });
}

export async function regenDraftAction(f: FormData) {
  const c = await requireWriter();
  back(f, await regenDraft(c.org.id, s(f, "id")));
}

export async function draftImageGenAction(f: FormData) {
  const c = await requireWriter();
  back(f, await imageForDraft(c.org.id, s(f, "id"), s(f, "prompt")));
}

export async function draftAttachImageAction(f: FormData) {
  const c = await requireWriter();
  back(f, await attachOwnImage(c.org.id, s(f, "id"), f.get("image")));
}

export async function draftReworkImageAction(f: FormData) {
  const c = await requireWriter();
  back(f, await reworkItemImage(c.org.id, s(f, "id"), s(f, "instruction")));
}

export async function draftRemoveImageAction(f: FormData) {
  const c = await requireWriter();
  const old = await q<{ image_id: string | null }>("update kz_content_items set image_id=null, meta = meta - 'imageOwn' where id=$1 and org_id=$2 returning (select image_id from kz_content_items where id=$1) image_id", [s(f, "id"), c.org.id]);
  if (old[0]?.image_id) await q("delete from kz_assets where id=$1 and org_id=$2", [old[0].image_id, c.org.id]);
  back(f, { ok: true });
}

/** «В контент-план»: дата и время публикации спрашиваются здесь. */
export async function draftToPlanAction(f: FormData) {
  const c = await requireWriter();
  const date = s(f, "date"), time = s(f, "time");
  const chs = await setItemChannels(c.org.id, s(f, "id"), f.getAll("ch").map(String));
  const r = chs.ok ? await draftToPlan(c.org.id, s(f, "id"), date, time) : chs;
  const label = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : date;
  back(f, r.ok ? { ok: true, note: `Материал добавлен в контент-план: ${label} в ${time}. В это время он уйдёт в каналы завода.` } : r, r.ok ? s(f, "id") : undefined);
}

export async function draftPublishAction(f: FormData) {
  const c = await requireWriter();
  const chs = await setItemChannels(c.org.id, s(f, "id"), f.getAll("ch").map(String));
  const r = chs.ok ? await draftPublishNow(c.org.id, s(f, "id")) : chs;
  // итог по каналам показываем сразу: если картинка не загрузилась, видна причина
  const rep = r.ok ? await publishReport(c.org.id, s(f, "id")) : r;
  back(f, rep.ok ? { ok: true, note: ("note" in rep ? rep.note : undefined) } : { ok: false, error: ("error" in rep ? rep.error : undefined) }, r.ok ? s(f, "id") : undefined);
}

export async function draftDiscardAction(f: FormData) {
  const c = await requireWriter();
  await discardDraft(c.org.id, s(f, "id"));
  back(f, { ok: true }, s(f, "id"));
}
