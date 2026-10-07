// Создаёт (или обновляет пароль) администратора платформы и его организацию с безлимитом.
// Запуск:  DATABASE_URL=… npm run admin:create
// Логин/пароль берутся из ADMIN_EMAIL / ADMIN_PASSWORD, а если их нет — из файла .admin-credentials.local
import pg from "pg";
import bcrypt from "bcryptjs";
import fs from "node:fs";

let email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
if ((!email || !password) && fs.existsSync(".admin-credentials.local")) {
  const kv = Object.fromEntries(fs.readFileSync(".admin-credentials.local", "utf8").split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2)).filter((x) => x[1] !== undefined));
  email ||= kv.ADMIN_EMAIL; password ||= kv.ADMIN_PASSWORD;
}
if (!email || !password || password.length < 12) { console.error("Нужны ADMIN_EMAIL и ADMIN_PASSWORD (от 12 символов)"); process.exit(1); }
email = email.trim().toLowerCase();
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL не задан"); process.exit(1); }

const c = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("begin");
  const hash = await bcrypt.hash(password, 11);
  const u = (await c.query(
    `insert into users(email,name,password_hash) values($1,'Администратор',$2)
     on conflict(email) do update set password_hash=excluded.password_hash returning id`, [email, hash])).rows[0];
  const has = (await c.query("select org_id from memberships where user_id=$1 and role='owner' limit 1", [u.id])).rows[0];
  if (!has) {
    const o = (await c.query("insert into orgs(name,plan,unlimited) values('Единая среда','agency',true) returning id")).rows[0];
    await c.query("insert into memberships(org_id,user_id,role) values($1,$2,'owner')", [o.id, u.id]);
  } else await c.query("update orgs set unlimited=true where id=$1", [has.org_id]);
  await c.query("commit");
  console.log("Администратор готов:", email);
} catch (e) { await c.query("rollback"); console.error(e.message); process.exit(1); }
await c.end();
