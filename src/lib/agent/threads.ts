import { one, q } from "../db";

/** Диалоги чата. Без миграции 032 (нет колонки thread_id) чат работает как одна общая лента. */
export interface Thread { id: string; title: string; updated_at: string; cost_kop: number }
let ok: { at: number; v: boolean } | null = null;

export async function threadsReady(): Promise<boolean> {
  if (ok && Date.now() - ok.at < 60_000) return ok.v;
  const r = await one("select 1 from information_schema.columns where table_name='kz_chat_messages' and column_name='thread_id'").catch(() => null);
  ok = { at: Date.now(), v: !!r };
  return ok.v;
}

export async function listThreads(orgId: string, userId: string, search = ""): Promise<Thread[]> {
  if (!(await threadsReady())) return [];
  const s = search.trim().slice(0, 60);
  return q<Thread>(
    `select t.id,t.title,t.updated_at,coalesce((select sum(cost_kop) from kz_chat_messages m where m.thread_id=t.id),0)::int cost_kop
       from kz_chat_threads t where t.org_id=$1 and t.user_id=$2
        and ($3='' or t.title ilike '%'||$3||'%' or exists(select 1 from kz_chat_messages m where m.thread_id=t.id and m.content ilike '%'||$3||'%'))
      order by t.updated_at desc limit 40`, [orgId, userId, s.replace(/[%_\\]/g, "")]);
}

export async function createThread(orgId: string, userId: string, title = "Новый диалог"): Promise<string | null> {
  if (!(await threadsReady())) return null;
  return (await one<{ id: string }>("insert into kz_chat_threads(org_id,user_id,title) values($1,$2,$3) returning id", [orgId, userId, title.slice(0, 80)]))?.id ?? null;
}

/** Диалог, с которым работаем: указанный (если он этого пользователя), иначе последний, иначе null. */
export async function currentThread(orgId: string, userId: string, wanted?: string): Promise<string | null> {
  if (!(await threadsReady())) return null;
  if (wanted && /^[0-9a-f-]{36}$/i.test(wanted)) {
    const t = await one<{ id: string }>("select id from kz_chat_threads where id=$1 and org_id=$2 and user_id=$3", [wanted, orgId, userId]);
    if (t) return t.id;
  }
  return (await one<{ id: string }>("select id from kz_chat_threads where org_id=$1 and user_id=$2 order by updated_at desc limit 1", [orgId, userId]))?.id ?? null;
}

export async function deleteThread(orgId: string, userId: string, id: string): Promise<void> {
  if (!(await threadsReady()) || !/^[0-9a-f-]{36}$/i.test(id)) return;
  await q("delete from kz_chat_threads where id=$1 and org_id=$2 and user_id=$3", [id, orgId, userId]);
}
