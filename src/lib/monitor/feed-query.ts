/** Фильтр ленты новостей: общая логика для страницы, обновления и проверки новых постов. Значения приходят из адреса, поэтому всё проверяется. */
export interface FeedFilter { /** один пост (ссылка из сводки трендов) */ id: string; show: string; days: number; src: string[]; kw: string[]; q: string; only: boolean; fit: boolean; sort: "date" | "match" }
const UUID = /^[0-9a-f-]{36}$/i;
const arr = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []).map(String);

export function parseFilter(sp: Record<string, string | string[] | undefined>): FeedFilter {
  const days = Number(Array.isArray(sp.d) ? sp.d[0] : sp.d);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const show = one(sp.show);
  const idv = one(sp.id);
  return {
    id: UUID.test(idv) ? idv : "",
    show: ["new", "saved", "used", "all"].includes(show) ? show : "new",
    days: [1, 3, 7, 30].includes(days) ? days : 7,
    src: arr(sp.src).filter((x) => UUID.test(x)).slice(0, 50), kw: arr(sp.kw).map((x) => x.slice(0, 80)).slice(0, 50),
    q: one(sp.q).slice(0, 80), only: one(sp.m) === "1", fit: one(sp.fit) === "1", sort: one(sp.sort) === "match" ? "match" : "date",
  };
}

export function feedWhere(orgId: string, f: FeedFilter, sinceFetched?: string): { sql: string; args: unknown[] } {
  // «Понравившееся» не стареет: сердечко ставят, чтобы вернуться позже, поэтому период там не ограничиваем
  const where: string[] = ["i.org_id=$1", "not i.excluded", f.show === "saved" ? "$2::text is not null" : "i.published_at > now() - ($2||' days')::interval"];
  const args: unknown[] = [orgId, String(f.days)];
  const add = (cond: string, v: unknown) => { args.push(v); where.push(cond.replace("?", `$${args.length}`)); };
  // один пост из сводки трендов: любые статусы и период, остальные фильтры не применяются
  if (f.id) { where.splice(1, 2, "$2::text is not null"); add("i.id=?::uuid", f.id); return { sql: where.join(" and "), args }; }
  if (f.show === "new") where.push("i.status='new'"); else if (f.show !== "all") add("i.status=?", f.show); else where.push("i.status<>'dismissed'");
  if (f.src.length) add("i.source_id = any(?::uuid[])", f.src);
  if (f.kw.length) add("i.matched && ?::text[]", f.kw);
  if (f.only) where.push("i.score>0");
  if (f.fit) where.push("i.fit_score >= 6");
  if (f.q) {
    // ilike не сворачивает регистр кириллицы, если у базы локаль C, поэтому ищем по вариантам написания: как ввели, строчные, ПРОПИСНЫЕ, С заглавной
    const esc = f.q.replace(/[%_\\]/g, "\\$&"), cap = esc.charAt(0).toUpperCase() + esc.slice(1).toLowerCase();
    args.push([...new Set([esc, esc.toLowerCase(), esc.toUpperCase(), cap])].map((x) => `%${x}%`));
    where.push(`(i.title ilike any($${args.length}::text[]) or i.body ilike any($${args.length}::text[]))`);
  }
  if (sinceFetched) add("i.fetched_at > ?::timestamptz", sinceFetched);
  return { sql: where.join(" and "), args };
}

export const feedOrder = (f: FeedFilter) => f.sort === "match" ? `${f.fit ? "i.fit_score desc nulls last," : ""} i.score desc, coalesce(i.fit_score,-1) desc, i.published_at desc` : "i.published_at desc, i.fetched_at desc";

/** Параметры фильтра → строка адреса (для переходов и кнопок). */
export function filterQuery(f: FeedFilter, extra: Record<string, string> = {}): string {
  const u = new URLSearchParams();
  if (f.show !== "new") u.set("show", f.show);
  if (f.days !== 7) u.set("d", String(f.days));
  for (const s of f.src) u.append("src", s); for (const k of f.kw) u.append("kw", k);
  if (f.q) u.set("q", f.q); if (f.only) u.set("m", "1"); if (f.fit) u.set("fit", "1"); if (f.sort === "match") u.set("sort", "match");
  for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v);
  const s = u.toString(); return s ? `?${s}` : "";
}
