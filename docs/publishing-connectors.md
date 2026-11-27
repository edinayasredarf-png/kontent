# Автопубликация и внешние коннекторы

Прямые API: Telegram, VK, MAX, WordPress, Discord, Telegra.ph, Facebook Pages,
Instagram (профессиональный аккаунт через Facebook Login), Threads, Pinterest, Одноклассники.
Подключения раздельны для каждого бренда; секреты сохраняются шифрованными.
Для Pinterest, ОК, Facebook, Instagram и Threads реализовано подключение через OAuth.
Приложения настраивает администратор в `/app/admin/social`: нужны собственные Client ID,
Client Secret и разрешения площадок. Пользователи не вводят токены: авторизуются в соцсети
и выбирают доску, группу, страницу или аккаунт. Наличие реализации API не означает
регистрации или одобрения приложения. Discord использует webhook URL.

Дзен, TikTok, YouTube, Reddit, RUTUBE, X, Tumblr, LinkedIn —
**внешние коннекторы**, а не готовые встроенные API этих площадок.
Пользователь должен создать и авторизовать сценарий n8n/Make или свой сервер.
Текст и картинки не являются видео. Если сценарий для видеоплощадки объявляет
поддержку image/carousel/article/text, он обязан самостоятельно создать и загрузить
соответствующее видео до ответа об успехе. Эти сценарии не входят в поставку.

## Протокол v1

HTTPS POST, JSON, без редиректов. Все запросы содержат:
`version: 1`, `platform` (код площадки), `account` (идентификатор назначения).
Заголовки `X-Timestamp` (Unix seconds) и
`X-Signature: sha256=HMAC_SHA256(secret, timestamp + '.' + rawBody)`.
Коннектор должен проверять подпись сравнением за постоянное время и отклонять
запросы старше пяти минут. Не логировать секреты и полное содержимое запросов.

Проверка не публикует ничего:

```json
{"version":1,"platform":"dzen","account":"my-channel","event":"integration.verify"}
```

HTTP 200:

```json
{"ok":true,"platform":"dzen","account":"my-channel","name":"Мой канал","capabilities":["text","image","carousel","article"]}
```

Объявлять только реально поддержанные форматы. Ошибки авторизации вернуть как 401/403;
лимит до начала публикации — 429. Проверка должна проверять реальный доступ к аккаунту.

Публикация содержит `event: publication.publish`, `publication_id` (UUID очереди),
`format`, `text`, `article` (null либо title, description, slug, keywords, html),
`images`: массив `{order,mime,base64,url?}` в порядке слайдов. Максимум 15 МБ файлов.
Сценарий должен исключать повторы по `(platform,account,publication_id)` и возвращать
сохранённый результат при повторе. Не отвечать успехом до завершения публикации.
Потерю картинки считать ошибкой, а не поводом выпустить текст без картинки.

HTTP 200 после публикации:

```json
{"ok":true,"platform":"dzen","account":"my-channel","status":"published","publication_id":"UUID из запроса","id":"реальный ID поста","url":"https://dzen.ru/a/реальный-пост"}
```

Ответ `202`, пустой `200`, queued/accepted не считаются публикацией. После таймаута
финальной отправки автоматический повтор не выполняется: нужно проверить журнал
коннектора, чтобы не создать дубль. Встроенная статистика новых площадок пока не добавлена.

## Официальные спецификации прямых API

- https://docs.discord.com/developers/resources/webhook
- https://telegra.ph/api
- https://developers.facebook.com/documentation/pages-api/posts
- https://developers.facebook.com/documentation/instagram-platform/content-publishing
- https://developers.facebook.com/documentation/threads/posts
- https://github.com/pinterest/api-description/blob/main/v5/openapi.yaml

Старые внешние подключения Одноклассников сохраняются как `ok_connector`, протокол
по-прежнему передаёт `platform=ok`. Новые прямые подключения используют `kind=ok`.
TenChat требует собственного партнёрского приложения и официальной документации;
пока они не предоставлены, прямое подключение отключено и это явно указано в форме.
