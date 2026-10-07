import { Pool, type QueryResultRow } from "pg";

const g = globalThis as unknown as { _pool?: Pool };

function pool(): Pool {
  if (!g._pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL не задан");
    g._pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    });
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
