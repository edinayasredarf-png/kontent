import pg from "pg";
import fs from "node:fs";
import path from "node:path";
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL не задан"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
await c.connect();
await c.query("create table if not exists _migrations(name text primary key, at timestamptz default now())");
for (const f of fs.readdirSync("db").filter((x) => x.endsWith(".sql")).sort()) {
  const done = await c.query("select 1 from _migrations where name=$1", [f]);
  if (done.rowCount) continue;
  await c.query("begin");
  try { await c.query(fs.readFileSync(path.join("db", f), "utf8")); await c.query("insert into _migrations(name) values($1)", [f]); await c.query("commit"); console.log("ok", f); }
  catch (e) { await c.query("rollback"); console.error("fail", f, e.message); process.exit(1); }
}
await c.end();
