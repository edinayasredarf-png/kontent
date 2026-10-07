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
