"use client";
import { useState } from "react";
import { Form, Field } from "./Form";
import { discoverMaxAction, saveChannel } from "@/lib/actions";

const KINDS: Record<string, string> = { telegram: "Telegram", vk: "ВКонтакте", max: "MAX (бета)", wordpress: "WordPress (SEO-статьи)", webhook: "Webhook (сайты и любые соцсети через n8n/Make)" };

/** Поля подключения зависят от типа канала — показываем только нужные и подсказываем, где взять значения. */
export function ChannelForm({ brands }: { brands: { id: string; name: string }[] }) {
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
  return (
    <Form action={saveChannel} submit="Проверить и подключить">
      <Field label="Бренд"><select name="brand_id" className="input">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <Field label="Тип"><select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
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
      <p className="text-xs text-ink3">Перед сохранением мы проверим доступ. Секреты хранятся в зашифрованном виде и больше нигде не показываются.</p>
    </Form>
  );
}
