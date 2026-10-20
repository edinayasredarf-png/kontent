"use client";
import { useState } from "react";
import { Form, Field } from "./Form";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { checkChannelAction, discoverMaxAction, saveChannel } from "@/lib/actions";

const KINDS: Record<string, string> = { telegram: "Telegram", vk: "ВКонтакте", max: "MAX (бета)", wordpress: "WordPress (SEO-статьи)", webhook: "Webhook (сайты и любые соцсети через n8n/Make)" };

/** Пошаговые инструкции: как получить доступ и что нажать на самой площадке. */
const GUIDE: Record<string, { title: string; steps: string[] }> = {
  telegram: { title: "Как подключить Telegram-канал", steps: [
    "В Telegram откройте @BotFather → команда /newbot → задайте имя и username бота. BotFather пришлёт токен — скопируйте его в поле «Токен бота».",
    "Откройте свой канал → «Управление каналом» → «Администраторы» → «Добавить администратора» → найдите бота по username и оставьте право «Публикация сообщений».",
    "В поле канала укажите @username публичного канала. Для закрытого канала нужен числовой id вида -100…: в ссылке на пост t.me/c/1234567890/5 возьмите число после c/ и допишите перед ним -100 (получится -1001234567890).",
    "Нажмите «Проверить подключение»: мы убедимся, что токен рабочий, а бот — администратор с правом публикации.",
  ] },
  vk: { title: "Как подключить сообщество ВКонтакте", steps: [
    "Откройте сообщество → «Управление» → «Настройки» → «Работа с API» → «Ключи доступа» → «Создать ключ».",
    "Отметьте права «Управление сообществом», «Стена» и «Фотографии» (без фотографий картинки и карусели не загрузятся). Скопируйте ключ в поле ниже.",
    "Числовой id сообщества: число из адреса вида vk.com/club123456789 (без «club» и без минуса). Если у сообщества короткий адрес, id указан в «Управление» → «Настройки» → «Работа с API».",
    "Нажмите «Проверить подключение». Проверка подтверждает, что ключ рабочий и сообщество найдено; права на стену и фотографии проверяются при первой публикации.",
  ] },
  max: { title: "Как подключить канал MAX", steps: [
    "В MAX для бизнеса создайте бота и скопируйте его токен.",
    "Добавьте бота в канал администратором и включите права «писать» и «читать все сообщения» (первое нужно для публикации, второе для чтения постов).",
    "Опубликуйте в канале любой пост, вставьте токен и нажмите «Найти каналы бота»: выберите свой канал из списка, id подставится сам.",
    "Нажмите «Проверить подключение».",
  ] },
  wordpress: { title: "Как подключить сайт на WordPress", steps: [
    "В WordPress откройте «Пользователи» → «Профиль» → блок «Пароли приложений», введите любое название и нажмите «Добавить». Скопируйте показанный пароль (он показывается один раз).",
    "Укажите адрес сайта (https://…), логин WordPress и этот пароль. Основной пароль от сайта вводить не нужно.",
    "Режим «Черновик» безопаснее: статья появится в WordPress, но не опубликуется без вашего решения.",
    "Нажмите «Проверить подключение». Если не проходит: проверьте, что сайт открывается по https и REST API не закрыт плагином безопасности.",
  ] },
  webhook: { title: "Как подключить сайт или соцсеть через webhook", steps: [
    "Подготовьте адрес, который принимает POST с JSON: свой обработчик на сайте или сценарий в n8n, Make или Zapier (триггер «Webhook»).",
    "Вставьте адрес в поле. Если хотите проверять подлинность запросов, придумайте секрет: мы подпишем каждый запрос (заголовок X-Signature).",
    "Нажмите «Проверить подключение»: мы отправим тестовый запрос и убедимся, что адрес отвечает.",
  ] },
};

/** Поля подключения зависят от типа канала — показываем только нужные и подсказываем, где взять значения. */
export function ChannelForm({ brands, factoryId, ret }: { brands: { id: string; name: string }[]; factoryId?: string; ret?: string }) {
  const [kind, setKind] = useState("telegram");
  const [found, setFound] = useState<{ id: string; title: string; channel: boolean }[]>([]);
  const [findMsg, setFindMsg] = useState("");
  const find = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.closest("form")!;
    const token = (form.querySelector('input[name="token"]') as HTMLInputElement | null)?.value ?? "";
    setFindMsg("Ищем…"); setFound([]);
    const r = await discoverMaxAction(token);
    if (r.ok) { setFound(r.chats); setFindMsg(""); } else setFindMsg(r.error);
  };
  const [chk, setChk] = useState<{ busy: boolean; ok?: boolean; text?: string }>({ busy: false });
  const check = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.closest("form")!;
    setChk({ busy: true });
    try { const r = await checkChannelAction(new FormData(form)); setChk(r.ok ? { busy: false, ok: true, text: `Канал подключён корректно: ${r.name}` } : { busy: false, ok: false, text: r.error }); }
    catch { setChk({ busy: false, ok: false, text: "Не удалось выполнить проверку" }); }
  };
  const g = GUIDE[kind];
  return (
    <Form action={saveChannel} submit="Проверить и подключить">
      {factoryId && <input type="hidden" name="factory" value={factoryId} />}{ret && <input type="hidden" name="ret" value={ret} />}
      <Field label="Бренд"><select name="brand_id" className="input">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <Field label="Тип"><select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      {g && (
        <details className="rounded-xl bg-tile p-3 text-sm" open>
          <summary className="cursor-pointer font-medium">{g.title}</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs text-ink2">{g.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </details>
      )}
      <Field label="Название (необязательно)"><input name="title" className="input" /></Field>
      {kind === "wordpress" && (<>
        <Field label="Адрес сайта"><input name="target" required className="input" placeholder="https://mysite.ru" /></Field>
        <Field label="Логин WordPress"><input name="wp_user" required autoComplete="off" className="input" /></Field>
        <Field label="Пароль приложения"><input name="token" type="password" required autoComplete="off" className="input" placeholder="xxxx xxxx xxxx xxxx" /></Field>
        <Field label="Режим"><select name="wp_status" className="input"><option value="draft">Сохранять черновиком (безопасно)</option><option value="publish">Публиковать сразу</option></select></Field>
        <p className="text-xs text-ink3">Пароль приложения создаётся в WordPress: Пользователи → Профиль → «Пароли приложений». Это не основной пароль, его можно отозвать в любой момент.</p>
      </>)}
      {kind === "webhook" && (<>
        <Field label="Адрес приёма (https://…)"><input name="target" required className="input" placeholder="https://mysite.ru/api/articles" /></Field>
        <Field label="Секрет для подписи (необязательно)"><input name="token" type="password" autoComplete="off" className="input" /></Field>
        <p className="text-xs text-ink3">Мы отправим POST с JSON. SEO-статья: event=article.publish, title, slug, description, keywords, html, image. Обычный пост: event=post.publish, text, image. Через n8n, Make или Zapier это превращается в публикацию в Instagram, TikTok, Threads, X и другие сети. Если указан секрет, в X-Signature будет HMAC-SHA256 от «timestamp.тело».</p>
      </>)}
      {kind === "max" && (<>
        <Field label="Токен бота MAX"><input name="token" type="password" required autoComplete="off" className="input" /></Field>
        <Field label="id чата или канала"><input name="target" required className="input" /></Field>
        <div className="space-y-2">
          <button type="button" onClick={find} className="btn btn-ghost !py-1.5 text-xs">Найти каналы бота</button>
          {findMsg && <p className="text-xs text-ink2">{findMsg}</p>}
          <div className="flex flex-wrap gap-1.5">{found.map((c) => <button key={c.id} type="button" className="chip cursor-pointer" onClick={(ev) => { const f = ev.currentTarget.closest("form")!; (f.querySelector('input[name="target"]') as HTMLInputElement).value = c.id; }}>{c.channel ? "Канал" : "Чат"}: {c.title}</button>)}</div>
        </div>
        <p className="text-xs text-ink3">Бот создаётся в MAX для бизнеса. Добавьте его в канал администратором и включите права «писать» и «читать все сообщения»: первое нужно для публикации, второе для чтения постов канала. id канала можно найти кнопкой выше: он определяется по событиям бота (добавление в канал, новый пост). Публикация проверена по документации, на живом канале пока не опробована.</p>
      </>)}
      {(kind === "telegram" || kind === "vk") && (<>
        <Field label={kind === "telegram" ? "Токен бота" : "Ключ доступа сообщества"}><input name="token" type="password" required autoComplete="off" className="input" /></Field>
        <Field label={kind === "telegram" ? "@канал или id" : "Числовой id сообщества"}><input name="target" required className="input" placeholder={kind === "telegram" ? "@mychannel" : "123456789"} /></Field>
      </>)}
      <div className="space-y-2">
        <button type="button" onClick={check} disabled={chk.busy} className="btn btn-ghost !py-1.5 text-xs">{chk.busy && <Loader2 size={14} className="animate-spin" />}Проверить подключение</button>
        {chk.text && <p className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs ${chk.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{chk.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}<span>{chk.text}</span></p>}
      </div>
      <p className="text-xs text-ink3">Перед сохранением мы проверим доступ. Секреты хранятся в зашифрованном виде и больше нигде не показываются.</p>
    </Form>
  );
}
