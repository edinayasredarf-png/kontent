import { createHash, randomBytes } from "node:crypto";
import { one, q } from "./db";
import { open, seal } from "./crypto";
import { SITE } from "./site";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export interface ShareLink { id: string; label: string; can_approve: boolean; show_report: boolean; auto_publish: boolean; expires_at: string | null; revoked: boolean; last_seen_at: string | null; created_at: string; url: string }

export const shareUrl = (token: string) => `${SITE}/share/${token}`;

/** Ссылки бренда. Адрес собирается из зашифрованного токена: владелец может скопировать его снова. */
export async function listLinks(orgId: string, brandId: string): Promise<ShareLink[]> {
  const rows = await q<Omit<ShareLink, "url"> & { token_enc: unknown }>(
    "select id,label,can_approve,show_report,auto_publish,expires_at,revoked,last_seen_at,created_at,token_enc from kz_share_links where org_id=$1 and brand_id=$2 order by created_at desc", [orgId, brandId]);
  return rows.map(({ token_enc, ...r }) => { let url = ""; try { url = shareUrl(open(token_enc).t); } catch { /* ключ шифрования сменили */ } return { ...r, url }; });
}

export async function createLink(orgId: string, brandId: string, o: { label: string; canApprove: boolean; showReport: boolean; autoPublish: boolean; days: number }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!(await one("select 1 from kz_brands where id=$1 and org_id=$2", [brandId, orgId]))) return { ok: false, error: "Бренд не найден" };
  const n = await one<{ n: string }>("select count(*) n from kz_share_links where org_id=$1 and brand_id=$2 and not revoked", [orgId, brandId]);
  if (Number(n!.n) >= 10) return { ok: false, error: "У бренда уже 10 активных ссылок — отзовите ненужные" };
  const token = randomBytes(24).toString("base64url");
  await q(`insert into kz_share_links(org_id,brand_id,token_hash,token_enc,label,can_approve,show_report,auto_publish,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [orgId, brandId, hash(token), JSON.stringify(seal({ t: token })), o.label.slice(0, 60), o.canApprove, o.showReport, o.autoPublish && o.canApprove, o.days > 0 ? new Date(Date.now() + o.days * 864e5).toISOString() : null]);
  return { ok: true, url: shareUrl(token) };
}

export async function revokeLink(orgId: string, id: string) { await q("update kz_share_links set revoked=true where id=$1 and org_id=$2", [id, orgId]); }

export interface Portal {
  link: { id: string; org_id: string; brand_id: string; can_approve: boolean; show_report: boolean; auto_publish: boolean };
  brand: { name: string; kit: unknown };
}
/** Находит действующую ссылку по токену. Любая неточность (формат, отзыв, срок) — null, без подсказок, что именно не так. */
export async function portalByToken(token: string): Promise<Portal | null> {
  if (!TOKEN_RE.test(token)) return null;
  const r = await one<Portal["link"] & { name: string; kit: unknown }>(
    `select l.id,l.org_id,l.brand_id,l.can_approve,l.show_report,l.auto_publish,b.name,b.kit from kz_share_links l join kz_brands b on b.id=l.brand_id join kz_orgs o on o.id=l.org_id
      where l.token_hash=$1 and not l.revoked and (l.expires_at is null or l.expires_at > now()) and not o.suspended`, [hash(token)]);
  if (!r) return null;
  q("update kz_share_links set last_seen_at=now() where id=$1", [r.id]).catch(() => {});
  return { link: { id: r.id, org_id: r.org_id, brand_id: r.brand_id, can_approve: r.can_approve, show_report: r.show_report, auto_publish: r.auto_publish }, brand: { name: r.name, kit: r.kit } };
}

export interface PortalItem { id: string; kind: string; topic: string; body: string; status: string; planned_for: string | null; slides: string[]; image: string | null; feedback: { author: string; verdict: string; comment: string; created_at: string }[] }

/** Материалы бренда, ожидающие решения клиента (готовы, но не опубликованы), плюс недавно опубликованные. */
export async function portalItems(p: Portal): Promise<PortalItem[]> {
  const items = await q<Omit<PortalItem, "slides" | "image" | "feedback"> & { image_id: string | null }>(
    `select id,kind,topic,body,status,planned_for,image_id from kz_content_items
      where org_id=$1 and brand_id=$2 and status in ('ready','scheduled') order by coalesce(scheduled_at, planned_for::timestamptz, created_at) limit 40`, [p.link.org_id, p.link.brand_id]);
  if (!items.length) return [];
  const ids = items.map((i) => i.id);
  const [assets, fb] = await Promise.all([
    q<{ id: string; item_id: string }>("select id,item_id from kz_assets where org_id=$1 and item_id = any($2::uuid[]) and position>=0 order by item_id,position", [p.link.org_id, ids]),
    q<{ item_id: string; author: string; verdict: string; comment: string; created_at: string }>("select item_id,author,verdict,comment,created_at from kz_item_feedback where item_id = any($1::uuid[]) order by created_at", [ids]),
  ]);
  return items.map((i) => ({ ...i, slides: assets.filter((a) => a.item_id === i.id).map((a) => a.id), image: i.image_id, feedback: fb.filter((f) => f.item_id === i.id) }));
}

/** Доступна ли картинка этому порталу: только слайды и картинки материалов его бренда. */
export async function portalAsset(p: Portal, assetId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return false;
  return !!(await one(
    `select 1 from kz_assets a where a.id=$3 and a.org_id=$1 and a.brand_id=$2 and (a.kind in ('logo') or a.item_id in (select id from kz_content_items where org_id=$1 and brand_id=$2)
       or a.id in (select image_id from kz_content_items where org_id=$1 and brand_id=$2 and image_id is not null))`, [p.link.org_id, p.link.brand_id, assetId]));
}

export interface Report { posts: number; views: number; reactions: number; er: string; top: { topic: string; kind: string; channel: string; views: number; reactions: number; url: string | null }[]; channels: { title: string; kind: string; members: number | null; growth: number | null }[]; byWeek: { week: string; posts: number; views: number }[] }
export async function portalReport(p: Portal, days = 30): Promise<Report> {
  const base = `from kz_publications p join kz_post_stats s on s.publication_id=p.id join kz_content_items i on i.id=p.item_id join kz_channels c on c.id=p.channel_id
                where p.org_id=$1 and i.brand_id=$2 and p.status='published' and p.published_at >= now() - interval '${days} days'`;
  const [tot, top, weeks, chans] = await Promise.all([
    one<{ posts: string; views: string; react: string }>(`select count(*) posts,coalesce(sum(s.views),0) views,coalesce(sum(s.likes+s.comments+s.reposts),0) react ${base}`, [p.link.org_id, p.link.brand_id]),
    q<{ topic: string; kind: string; channel: string; views: number; react: number; url: string | null }>(`select i.topic,i.kind,c.title as channel,s.views,(s.likes+s.comments+s.reposts) as react,p.external_url as url ${base} order by s.views desc limit 5`, [p.link.org_id, p.link.brand_id]),
    q<{ week: string; posts: string; views: string }>(`select to_char(date_trunc('week', p.published_at),'DD.MM') as week,count(*) posts,coalesce(sum(s.views),0) views ${base} group by date_trunc('week', p.published_at) order by date_trunc('week', p.published_at)`, [p.link.org_id, p.link.brand_id]),
    q<{ title: string; kind: string; now: number | null; before: number | null }>(
      `select c.title,c.kind,
              (select members from kz_channel_stats where channel_id=c.id order by day desc limit 1) as now,
              (select members from kz_channel_stats where channel_id=c.id and day <= current_date - ${days} order by day desc limit 1) as before
         from kz_channels c where c.org_id=$1 and c.brand_id=$2 and c.status='active'`, [p.link.org_id, p.link.brand_id]),
  ]);
  const posts = Number(tot!.posts), views = Number(tot!.views), react = Number(tot!.react);
  return {
    posts, views, reactions: react, er: views ? ((react / views) * 100).toFixed(1) : "0",
    top: top.map((t) => ({ topic: t.topic, kind: t.kind, channel: t.channel, views: t.views, reactions: t.react, url: t.url })),
    byWeek: weeks.map((w) => ({ week: w.week, posts: Number(w.posts), views: Number(w.views) })),
    channels: chans.map((c) => ({ title: c.title, kind: c.kind, members: c.now, growth: c.now != null && c.before != null ? c.now - c.before : null })),
  };
}

export type FeedbackResult = { ok: true; queued?: boolean } | { ok: false; error: string };
/** Ответ клиента по материалу. Только по своему бренду, только пока материал не опубликован; не чаще 30 ответов в час на ссылку. */
export async function submitFeedback(token: string, itemId: string, verdict: string, author: string, comment: string): Promise<FeedbackResult> {
  const p = await portalByToken(token);
  if (!p) return { ok: false, error: "Ссылка недействительна или срок её действия истёк" };
  if (!["approved", "changes", "comment"].includes(verdict)) return { ok: false, error: "Неизвестное действие" };
  if (verdict !== "comment" && !p.link.can_approve) return { ok: false, error: "По этой ссылке можно только комментировать" };
  const text = comment.trim().slice(0, 1500), who = author.trim().slice(0, 60);
  if (verdict !== "approved" && !text) return { ok: false, error: verdict === "changes" ? "Опишите, что нужно изменить" : "Введите комментарий" };
  const n = await one<{ n: string }>("select count(*) n from kz_item_feedback where link_id=$1 and created_at > now() - interval '1 hour'", [p.link.id]);
  if (Number(n!.n) >= 30) return { ok: false, error: "Слишком много ответов за час. Попробуйте позже." };
  const it = await one<{ status: string }>("select status from kz_content_items where id=$1 and org_id=$2 and brand_id=$3 and status in ('ready','scheduled')", [itemId, p.link.org_id, p.link.brand_id]);
  if (!it) return { ok: false, error: "Этот материал уже недоступен для согласования" };
  await q("insert into kz_item_feedback(org_id,item_id,link_id,author,verdict,comment) values($1,$2,$3,$4,$5,$6)", [p.link.org_id, itemId, p.link.id, who, verdict, text]);
  if (verdict !== "comment") await q("update kz_content_items set meta = meta || jsonb_build_object('client', jsonb_build_object('verdict',$2::text,'by',$3::text,'at',now())), updated_at=now() where id=$1", [itemId, verdict, who]);
  if (verdict === "approved" && p.link.auto_publish && it.status === "ready") {
    const { enqueue } = await import("./pipeline");
    const r = await enqueue(p.link.org_id, itemId);
    return { ok: true, queued: r.ok };
  }
  return { ok: true };
}
