// Общий коннект для скриптов: те же правила TLS, что в src/lib/pgssl.ts (Timeweb CA).
import pg from "pg";
import fs from "node:fs";

export async function connect() {
  const url = (process.env.DATABASE_URL ?? process.env.TIMEWEB_DATABASE_URL ?? "").trim();
  if (!url) { console.error("DATABASE_URL не задан"); process.exit(1); }
  let host = "", cs = url;
  try { const u = new URL(url); host = u.hostname; for (const k of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) u.searchParams.delete(k); cs = u.toString(); } catch {}
  let ssl = false;
  if (host !== "localhost" && host !== "127.0.0.1") {
    if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") ssl = { rejectUnauthorized: false };
    else {
      let ca = process.env.DATABASE_SSL_CA_PEM?.trim()?.replace(/\\n/g, "\n");
      if (!ca) { const m = fs.readFileSync(new URL("../src/lib/timewebCa.ts", import.meta.url), "utf8").match(/`(-----BEGIN[\s\S]*?)`/); ca = m?.[1]; }
      ssl = { rejectUnauthorized: true, ca, servername: process.env.DATABASE_SSL_SERVERNAME?.trim() || (/^\d+\.\d+\.\d+\.\d+$/.test(host) ? undefined : host) };
    }
  }
  const c = new pg.Client({ connectionString: cs, ssl, connectionTimeoutMillis: 15000 });
  await c.connect();
  return c;
}
