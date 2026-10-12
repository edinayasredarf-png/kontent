import { one, q } from "../db";
import { KB_LIMITS, type KbKind } from "./ingest";

/** Добавляет материал в базу знаний бренда с проверкой лимитов. Повтор того же текста не создаёт дубль. */
export async function addDoc(orgId: string, brandId: string, d: { kind: KbKind; title: string; text: string; url?: string; useStyle: boolean }): Promise<{ id?: string; error?: string }> {
  const text = d.text.replace(/\r/g, "").trim();
  if (text.length < KB_LIMITS.minChars) return { error: "Слишком короткий текст (нужно хотя бы пара абзацев)" };
  const n = Number((await one<{ n: string }>("select count(*) n from kz_brand_docs where brand_id=$1", [brandId]))!.n);
  if (n >= KB_LIMITS.docs) return { error: `Лимит: не больше ${KB_LIMITS.docs} материалов на бренд. Удалите лишние.` };
  const clipped = text.slice(0, KB_LIMITS.chars);
  if (await one("select 1 from kz_brand_docs where brand_id=$1 and md5(text)=md5($2)", [brandId, clipped])) return { error: "Такой материал уже есть" };
  const title = (d.title.trim() || clipped.split("\n")[0]).slice(0, 160);
  const r = await one<{ id: string }>("insert into kz_brand_docs(org_id,brand_id,kind,title,url,text,chars,use_style) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
    [orgId, brandId, d.kind, title, d.url ?? null, clipped, clipped.length, d.useStyle]);
  void q;
  return { id: r!.id };
}
