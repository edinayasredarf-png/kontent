import { Pool, type QueryResultRow } from "pg";
import { cleanDbUrl, sslFor, stripSsl } from "./pgssl";

const g = globalThis as unknown as { _pool?: Pool };

function pool(): Pool {
  if (!g._pool) {
    const url = cleanDbUrl(process.env.DATABASE_URL ?? process.env.TIMEWEB_DATABASE_URL);
    if (!url) throw new Error("DATABASE_URL не задан");
    // Маленький пул на инстанс: БД общая с единойсредой, лимит соединений у Timeweb один на всех.
    g._pool = new Pool({
      connectionString: stripSsl(url),
      max: Number(process.env.DATABASE_POOL_MAX) || 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      ssl: sslFor(url),
    });
    g._pool.on("error", (e) => console.error("[pg] pool error:", e.message));
  }
  return g._pool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(sql, params)).rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(sql, params))[0] ?? null;
}

export async function tx<T>(fn: (run: typeof q) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  const run = async <R extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) => (await c.query<R>(sql, params)).rows;
  try {
    await c.query("begin");
    const r = await fn(run);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
