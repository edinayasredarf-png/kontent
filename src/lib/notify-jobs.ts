import { q } from "./db";
import { notify } from "./notify";

/**
 * Периодические уведомления, которые воркер собирает по организациям сразу пачкой (чтобы не засыпать клиента событиями по одному):
 * идеи на одобрении, новости по ключевым словам, нехватка контент-плана, новые комментарии, напоминание о настройке.
 * Повторы исключены ключом dedupe: за период — одно уведомление.
 */
const day = () => new Date().toISOString().slice(0, 10);
const bucket3h = () => `${day()}-${Math.floor(new Date().getUTCHours() / 3)}`;

export async function runNotifyJobs(): Promise<{ sent: number }> {
  let sent = 0;
  const send = async (orgId: string, n: Parameters<typeof notify>[1]) => { await notify(orgId, n); sent++; };
  try {
    // 1) идеи ждут одобрения: раз в сутки
    for (const r of await q<{ org_id: string; n: string }>(
      `select i.org_id,count(*) n from kz_content_items i join kz_factories f on f.id=i.factory_id where i.status='idea' and f.approval='manual' and f.status='active'
        and not coalesce((i.meta->>'draft')::boolean,false) group by i.org_id`))
      await send(r.org_id, { kind: "ideas_pending", title: `Идеи ждут одобрения: ${r.n}`, body: "Одобрите нужные, и сервис напишет материалы по расписанию", href: "/app/calendar", dedupe: `ideas:${day()}` });

    // 2) новости, подошедшие под ключевые слова: не чаще раза в три часа
    for (const r of await q<{ org_id: string; n: string; titles: string[] }>(
      `select org_id,count(*) n,(array_agg(title order by score desc))[1:2] titles from kz_feed_items
        where fetched_at > now() - interval '3 hours' and status='new' and not excluded and cardinality(matched) > 0 group by org_id`))
      await send(r.org_id, { kind: "news_match", title: `Новости по вашим ключевым словам: ${r.n}`, body: (r.titles ?? []).join(" · "), href: "/app/monitor", dedupe: `news:${bucket3h()}` });

    // 3) контент-план заканчивается у активных заводов: раз в сутки
    for (const r of await q<{ org_id: string; name: string }>(
      `select f.org_id,f.name from kz_factories f where f.status='active' and
         (select count(*) from kz_content_items i where i.factory_id=f.id and i.status in ('idea','approved','ready','scheduled') and i.planned_for >= current_date) < 3`))
      await send(r.org_id, { kind: "plan_low", title: `В плане завода «${r.name}» почти не осталось материалов`, body: "Продлите план или включите автопополнение", href: "/app/factories", dedupe: `plan:${r.name}:${day()}` });

    // 4) новые комментарии под постами: не чаще раза в три часа
    for (const r of await q<{ org_id: string; n: string }>(
      "select org_id,count(*) n from kz_comments where status='new' and created_at > now() - interval '3 hours' group by org_id").catch(() => []))
      await send(r.org_id, { kind: "comments", title: `Новые комментарии под постами: ${r.n}`, href: "/app/inbox", dedupe: `comments:${bucket3h()}` });

    // 5) настройка не завершена через сутки после регистрации: один раз
    for (const r of await q<{ org_id: string }>(
      `select o.id org_id from kz_orgs o where o.created_at < now() - interval '1 day' and o.created_at > now() - interval '5 days'
         and not exists (select 1 from kz_factories f where f.org_id=o.id)`))
      await send(r.org_id, { kind: "setup", title: "Завершите настройку, и первый материал будет готов за несколько минут", body: "Ассистент в чате проведёт по шагам и напишет первый пост бесплатно", href: "/app", dedupe: "setup:day1", to: "managers" });
  } catch { /* необязательно */ }
  return { sent };
}
