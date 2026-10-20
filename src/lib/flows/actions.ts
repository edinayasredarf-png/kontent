"use server";
import { attachFlowImage } from "../item-images";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "../auth";
import { one, q } from "../db";
import { cleanFlowSettings } from "./settings";
import { publishFlowItem, rescueFlowItem, rewriteFlowItem } from "./run";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (flow: string, tab: string, err?: string, note?: string) => { revalidatePath("/app/flows", "layout"); redirect(`/app/flows/${flow}?t=${tab}${err ? `&err=${encodeURIComponent(err)}` : ""}${note ? `&note=${encodeURIComponent(note)}` : ""}`); };
const MAX_FLOWS = 10;

export async function createFlowAction(f: FormData) {
  const c = await requireWriter();
  const name = s(f, "name").slice(0, 80), brand = s(f, "brand");
  const sources = f.getAll("sources").map(String), channels = f.getAll("channels").map(String);
  const fail = (m: string) => redirect(`/app/flows?err=${encodeURIComponent(m)}`);
  if (name.length < 2) return fail("Назовите поток");
  if (!(await one("select 1 from kz_brands where id=$1 and org_id=$2", [brand, c.org.id]))) return fail("Выберите бренд");
  const okSrc = (await q<{ id: string }>("select id from kz_sources where org_id=$1 and kind<>'manual' and id = any($2::uuid[])", [c.org.id, sources.filter((x) => /^[0-9a-f-]{36}$/i.test(x))])).map((x) => x.id);
  const okCh = (await q<{ id: string }>("select id from kz_channels where org_id=$1 and status='active' and kind not in ('wordpress') and id = any($2::uuid[])", [c.org.id, channels.filter((x) => /^[0-9a-f-]{36}$/i.test(x))])).map((x) => x.id);
  if (!okSrc.length) return fail("Выберите хотя бы один источник (добавьте их в «Мониторинге»)");
  if (!okCh.length) return fail("Выберите хотя бы один канал для публикации");
  if (Number((await one<{ n: string }>("select count(*) n from kz_flows where org_id=$1", [c.org.id]))!.n) >= MAX_FLOWS) return fail(`Не больше ${MAX_FLOWS} потоков`);
  const row = await one<{ id: string }>("insert into kz_flows(org_id,brand_id,name,source_ids,channel_ids,settings) values($1,$2,$3,$4,$5,$6) returning id",
    [c.org.id, brand, name, okSrc, okCh, JSON.stringify(cleanFlowSettings({ mode: "approve" }))]);
  redirect(`/app/flows/${row!.id}?t=settings`);
}

export async function saveFlowSettingsAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id");
  const st = cleanFlowSettings({
    mode: s(f, "mode"), maxAgeHours: s(f, "maxAgeHours"), dedupe: f.get("dedupe") === "on", minFit: s(f, "minFit"), topics: f.getAll("topics"), types: f.getAll("types"), scopes: f.getAll("scopes"), geo: s(f, "geo"),
    include: s(f, "include"), exclude: s(f, "exclude"), tone: String(f.get("tone") ?? ""), examples: String(f.get("examples") ?? ""), images: s(f, "images"), source: s(f, "source"),
    dailyCap: s(f, "dailyCap"), quietFrom: s(f, "quietFrom"), quietTo: s(f, "quietTo"), minGapMin: s(f, "minGapMin"),
  });
  const sources = f.getAll("sources").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)), channels = f.getAll("channels").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const okSrc = (await q<{ id: string }>("select id from kz_sources where org_id=$1 and kind<>'manual' and id = any($2::uuid[])", [c.org.id, sources])).map((x) => x.id);
  const okCh = (await q<{ id: string }>("select id from kz_channels where org_id=$1 and status='active' and kind<>'wordpress' and id = any($2::uuid[])", [c.org.id, channels])).map((x) => x.id);
  if (!okSrc.length || !okCh.length) return back(id, "settings", "Нужен хотя бы один источник и один канал");
  await q("update kz_flows set settings=$3, name=$4, source_ids=$5, channel_ids=$6 where id=$1 and org_id=$2", [id, c.org.id, JSON.stringify(st), s(f, "name").slice(0, 80) || "Поток", okSrc, okCh]);
  back(id, "settings", undefined, "Настройки сохранены");
}

export async function toggleFlowAction(f: FormData) {
  const c = await requireWriter();
  await q("update kz_flows set status=case when status='active' then 'paused' else 'active' end, note='' where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  back(s(f, "id"), s(f, "tab") || "pending");
}

export async function deleteFlowAction(f: FormData) {
  const c = await requireWriter();
  await q("delete from kz_flows where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  revalidatePath("/app/flows");
  redirect("/app/flows");
}

export async function approveFlowItemAction(f: FormData) {
  const c = await requireWriter();
  // если выбрали файл и не нажали «Загрузить», прикрепляем его перед публикацией
  const up = f.get("image");
  if (up instanceof File && up.size) { const ir = await attachFlowImage(c.org.id, s(f, "item"), up); if (!ir.ok) return back(s(f, "flow"), s(f, "tab") || "pending", ir.error); }
  const r = await publishFlowItem(c.org.id, s(f, "item"), String(f.get("text") ?? ""));
  back(s(f, "flow"), s(f, "tab") || "pending", r.ok ? undefined : r.error, r.ok ? "Поставлено в очередь публикации" : undefined);
}

export async function rewriteFlowItemAction(f: FormData) {
  const c = await requireWriter();
  const r = await rewriteFlowItem(c.org.id, s(f, "item"), s(f, "note"));
  back(s(f, "flow"), s(f, "tab") || "pending", r.ok ? undefined : r.error);
}

export async function rejectFlowItemAction(f: FormData) {
  const c = await requireWriter();
  await q("update kz_flow_items set status='rejected', reject_code='manual', reject_note=null, updated_at=now() where id=$1 and org_id=$2 and status in ('pending','ready','failed')", [s(f, "item"), c.org.id]);
  back(s(f, "flow"), s(f, "tab") || "pending");
}

export async function rescueFlowItemAction(f: FormData) {
  const c = await requireWriter();
  const r = await rescueFlowItem(c.org.id, s(f, "item"));
  back(s(f, "flow"), "rejected", r.ok ? undefined : r.error, r.ok ? "Новость вернулась в очередь на одобрение" : undefined);
}
