import { TIMEWEB_CLOUD_CA_PEM } from "./timewebCa";

/**
 * TLS к Timeweb PostgreSQL — те же переменные, что на единойсреде.рф:
 *  DATABASE_URL, DATABASE_SSL_CA_PEM (необязательно, по умолчанию вшит публичный CA Timeweb),
 *  DATABASE_SSL_SERVERNAME (если хост в URL — IP/localhost), DATABASE_SSL_REJECT_UNAUTHORIZED=false (только локально).
 */
export function stripSsl(cs: string): string {
  try {
    const u = new URL(cs);
    for (const k of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) u.searchParams.delete(k);
    return u.toString();
  } catch { return cs; }
}

export function sslFor(cs: string): false | { rejectUnauthorized: boolean; ca?: string; servername?: string } {
  let host = "";
  try { host = new URL(cs).hostname; } catch { /* оставим пустым */ }
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") return { rejectUnauthorized: false };
  const pem = process.env.DATABASE_SSL_CA_PEM?.trim();
  const ca = pem?.includes("BEGIN CERTIFICATE") ? pem.replace(/\\n/g, "\n") : TIMEWEB_CLOUD_CA_PEM;
  const servername = process.env.DATABASE_SSL_SERVERNAME?.trim() || (host && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? host : undefined);
  return { rejectUnauthorized: true, ca, ...(servername ? { servername } : {}) };
}

/**
 * Строка подключения из окружения. На Vercel её часто вставляют вместе с кавычками, с «DATABASE_URL=» или целой командой
 * `psql "postgresql://…"` — драйвер тогда не видит схему и идёт на несуществующий хост «base». Достаём сам URL.
 */
export function cleanDbUrl(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  const m = s.match(/postgres(?:ql)?:\/\/[^\s"'`]+/i);
  if (m) return m[0];
  // без схемы: «user:pass@host:5432/db» — достраиваем
  return /^[^\s:@/]+:[^\s]*@[^\s/]+\/\S+$/.test(s) ? `postgresql://${s}` : s;
}

/** Что не так со значением, если оно не разбирается как URL (без раскрытия самого значения). */
export function dbUrlProblem(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return "пусто";
  const hints: string[] = [];
  if (/^["'`]/.test(s) || /["'`]$/.test(s)) hints.push("значение в кавычках");
  if (/^DATABASE_URL\s*=/i.test(s)) hints.push("в значении есть «DATABASE_URL=»");
  if (/^psql\b/i.test(s)) hints.push("вставлена команда psql");
  if (!/postgres(?:ql)?:\/\//i.test(s)) hints.push("нет «postgresql://» в начале");
  if (/\s/.test(s)) hints.push("есть пробелы или переводы строк внутри");
  return hints.length ? hints.join("; ") : null;
}
