# Контент-завод (lontent)

Next.js 15 + Tailwind 4 + Postgres. Мультитенантная платформа: организации → бренды → заводы → материалы.

## Локально
```bash
cp .env.example .env.local   # заполнить DATABASE_URL, AUTH_SECRET, ANTHROPIC_API_KEY
npm i && npm run db:migrate && npm run dev
```

## Деплой на Vercel
1. `npx vercel link` → создать проект, Root Directory — корень этого репозитория.
2. Env:
   - `DATABASE_URL` — можно та же Timeweb-БД, что у единойсреды: все таблицы проекта с префиксом `kz_`, чужие не затрагиваются. Те же `DATABASE_SSL_*`, если они там заданы (`DATABASE_SEARCH_PATH` не нужен)
   - `AUTH_SECRET` (`openssl rand -base64 32`), опционально `CHANNEL_SECRET` для шифрования токенов каналов
   - `SELFHOSTED_LLM_URL`, `SELFHOSTED_LLM_API_KEY`, `SELFHOSTED_LLM_MODEL` — AI Gateway Timeweb, **значения те же, что в проекте единойсреде.рф**
   - `CRON_SECRET` — секрет для воркера
   - `PLATFORM_ADMIN_EMAILS` — кто видит «Настройки ИИ» (выбор моделей по задачам)
3. Миграции: `DATABASE_URL=… npm run db:migrate` с локальной машины.
4. Домен: Vercel → Settings → Domains → `kontent.единаясреда.рф` (punycode: `kontent.xn--80aakbcct4b2aj7m.xn--p1ai`). У DNS-хостинга домена добавить CNAME `kontent` → `cname.vercel-dns.com`.

## Воркер (cron)
`GET/POST /api/cron/tick` с заголовком `Authorization: Bearer $CRON_SECRET`. За проход: одобряет идеи автозаводов → пополняет план → пишет тексты по наступившим датам → ставит в очередь по расписанию → отправляет в Telegram/VK с ретраями (3 попытки, 5/10 мин).
Vercel Hobby даёт cron раз в сутки (`vercel.json`) — это страховка. Основной вызов: cron-job.org каждые 5 минут на `https://kontent.единаясреда.рф/api/cron/tick` с этим заголовком.

## Каналы
- **Telegram:** бот от @BotFather, добавить админом канала; в форме — токен и `@канал`.
- **VK:** сообщество → Управление → API → ключ доступа с правом «стена»; в форме — ключ и числовой id сообщества.
Токен проверяется перед сохранением и хранится зашифрованным (AES-256-GCM).

## Вход через Яндекс и VK
Переменные (имена как на единойсреде): `YANDEX_CLIENT_ID` (или `NEXT_PUBLIC_YANDEX_CLIENT_ID`), `YANDEX_CLIENT_SECRET`, `VK_CLIENT_ID` (или `NEXT_PUBLIC_VK_CLIENT_ID`), `VK_CLIENT_SECRET`. Кнопки появляются на страницах входа и регистрации только для настроенных провайдеров.
В настройках приложения у провайдера добавьте Redirect URI:
- `https://kontent.xn--80aakbcct4b2aj7m.xn--p1ai/api/oauth/yandex/callback`
- `https://kontent.xn--80aakbcct4b2aj7m.xn--p1ai/api/oauth/vk/callback`

Миграция: `db/004_oauth.sql` (в `adminer-schema.sql` уже включена).
