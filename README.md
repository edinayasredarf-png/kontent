# Контент-завод (lontent)

Next.js 15 + Tailwind 4 + Postgres. Мультитенантная платформа: организации → бренды → заводы → материалы.

## Локально
```bash
cp .env.example .env.local   # заполнить DATABASE_URL, AUTH_SECRET, ANTHROPIC_API_KEY
npm i && npm run db:migrate && npm run dev
```

## Деплой на Vercel
1. `npx vercel link` → создать проект, Root Directory — корень этого репозитория.
2. Env: `DATABASE_URL` (отдельная БД, не БД основного сайта), `AUTH_SECRET` (`openssl rand -base64 32`), `ANTHROPIC_API_KEY`.
3. Миграции: `DATABASE_URL=… npm run db:migrate` с локальной машины.
4. Домен: Vercel → Settings → Domains → `lontent.xn--e1afkcbdbfgfrh.xn--p1ai` (кириллицу вводить как есть: `lontent.единаясреда.рф`). У DNS-хостинга домена добавить CNAME `lontent` → `cname.vercel-dns.com`.
