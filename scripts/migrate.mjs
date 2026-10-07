import { connect } from "./pg.mjs";
import fs from "node:fs";
import path from "node:path";
const c = await connect();
await c.query("create table if not exists kz_migrations(name text primary key, at timestamptz default now())");
for (const f of fs.readdirSync("db").filter((x) => x.endsWith(".sql")).sort()) {
  const done = await c.query("select 1 from kz_migrations where name=$1", [f]);
  if (done.rowCount) continue;
  await c.query("begin");
  try { await c.query(fs.readFileSync(path.join("db", f), "utf8")); await c.query("insert into kz_migrations(name) values($1)", [f]); await c.query("commit"); console.log("ok", f); }
  catch (e) { await c.query("rollback"); console.error("fail", f, e.message); process.exit(1); }
}
await c.end();
