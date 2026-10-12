// Собирает db/adminer-schema.sql из всех миграций и списка EXPECTED_MIGRATIONS. Запуск: node scripts/gen-schema.mjs
import fs from "node:fs";
const files = fs.readdirSync("db").filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
const expected = [...fs.readFileSync("src/lib/migrations.ts", "utf8").matchAll(/"(\d{3}_[^"]+\.sql)"/g)].map((m) => m[1]);
const miss = files.filter((f) => !expected.includes(f));
if (miss.length) { console.error("Нет в EXPECTED_MIGRATIONS:", miss.join(", ")); process.exit(1); }
// Повторный прогон на живой базе: проверки (check) не должны падать на строках с форматами, добавленными более поздними миграциями.
const notValid = (sql) => sql.replace(/(add\s+constraint\s+\w+\s+check\s*\((?:[^()]|\([^()]*\))*\))(\s*;)/gi, "$1 not valid$2");
const out = files.map((f) => `-- ${f}\n${notValid(fs.readFileSync(`db/${f}`, "utf8").trim())}\n`).join("\n") +
  `\ncreate table if not exists kz_migrations(name text primary key, at timestamptz default now());\ninsert into kz_migrations(name) values ${files.map((f) => `('${f}')`).join(",")} on conflict do nothing;\n`;
fs.writeFileSync("db/adminer-schema.sql", out);
console.log("ok:", files.length, "миграций");
