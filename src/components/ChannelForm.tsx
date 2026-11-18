"use client";
import { useEffect, useState } from "react";
import { Form, Field } from "./Form";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { GUIDE } from "@/lib/guides";
import { channelConnectionAvailability } from "@/lib/channel-connect-actions";
import { ChannelConnectPanel } from "./ChannelConnectPanel";
import { MaxBotPanel } from "./MaxBotPanel";
import { checkChannelAction, discoverMaxAction, saveChannel } from "@/lib/actions";

const KINDS: Record<string, string> = { telegram: "Telegram", vk: "ВКонтакте", max_bot: "MAX", max: "MAX · свой бот", wordpress: "WordPress (SEO-статьи)", webhook: "Webhook (сайты и любые соцсети через n8n/Make)" };

/** Поля подключения зависят от типа канала — показываем только нужные и подсказываем, где взять значения. */
export function ChannelForm({ brands, factoryId, ret, maxBot, initialKind }: { initialKind?: string; brands: { id: string; name: string }[]; factoryId?: string; ret?: string; maxBot?: { link: string; name: string } }) {
  const [kind, setKind] = useState(initialKind && initialKind in KINDS ? initialKind : "telegram");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [telegramShared, setTelegramShared] = useState(false);
  useEffect(() => { let active = true; channelConnectionAvailability().then(value => { if (active) setTelegramShared(value.telegram); }).catch(() => {}); return () => { active = false; }; }, []);
  const hasConnectButton = kind === "vk" || kind === "telegram" && telegramShared;
  const [manual, setManual] = useState(false);
  const guided = hasConnectButton && !manual;
  const kinds = Object.entries(KINDS).filter(([k]) => k !== "max_bot" || maxBot);
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
    <Form action={saveChannel} submit={kind === "max_bot" || guided ? "" : "Проверить и подключить"}>
      {factoryId && <input type="hidden" name="factory" value={factoryId} />}{ret && <input type="hidden" name="ret" value={ret} />}
      <Field label="Бренд"><select name="brand_id" value={brandId} onChange={e => setBrandId(e.target.value)} className="input">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <Field label="Тип"><select name="kind" value={kind} onChange={(e) => { setKind(e.target.value); setManual(false); }} className="input">{kinds.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      {g && !guided && (
        <details className="rounded-xl bg-tile p-3 text-sm" open>
          <summary className="cursor-pointer font-medium">{g.title}</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs text-ink2">{g.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </details>
      )}
      {hasConnectButton && <><ChannelConnectPanel key={`${kind}-${brandId}`} provider={kind as "vk" | "telegram"} brandId={brandId} factoryId={factoryId} /><button type="button" className="text-xs text-ink2 hover:text-ink" onClick={() => setManual(!manual)}>{manual ? "Скрыть ввод ключа вручную" : "Подключить своим ключом вручную"}</button></>}
      {kind === "max_bot" && maxBot && <MaxBotPanel botLink={maxBot.link} botName={maxBot.name} factoryId={factoryId} />}
      {kind !== "max_bot" && !guided && <Field label="Название (необязательно)"><input name="title" className="input" /></Field>}
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
      {(kind === "telegram" || kind === "vk") && !guided && (<>
        <Field label={kind === "telegram" ? "Токен бота" : "Ключ доступа VK (сообщества или пользователя)"}><input name="token" type="password" required autoComplete="off" className="input" /></Field>
        {kind === "vk" && <Field label="Ключ пользователя для фото и аналитики (необязательно)"><input name="photoToken" type="password" autoComplete="off" className="input" /><p className="mt-2 text-xs text-ink3">Ключ администратора сообщества с правами photos и wall. Нужен для загрузки фотографий на стену, если основной ключ принадлежит сообществу.</p></Field>}
        <Field label={kind === "telegram" ? "@канал или id" : "Числовой id сообщества"}><input name="target" required className="input" placeholder={kind === "telegram" ? "@mychannel" : "123456789"} /></Field>
      </>)}
      {kind !== "max_bot" && !guided && (<>
      <div className="space-y-2">
        <button type="button" onClick={check} disabled={chk.busy} className="btn btn-ghost !py-1.5 text-xs">{chk.busy && <Loader2 size={14} className="animate-spin" />}Проверить подключение</button>
        {chk.text && <p className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs ${chk.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{chk.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}<span>{chk.text}</span></p>}
      </div>
      <p className="text-xs text-ink3">Перед сохранением мы проверим доступ. Секреты хранятся в зашифрованном виде и больше нигде не показываются.</p>
      </>)}
    </Form>
  );
}
