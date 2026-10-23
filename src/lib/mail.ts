import nodemailer, { type Transporter } from "nodemailer";
import { one, q } from "./db";
import { open, seal } from "./crypto";

/**
 * Почта берётся из настроек в админке («Администрирование → Почта»), а если там пусто — из переменных окружения
 * SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM (те же, что на единойсреде).
 */
export interface MailConfig { host: string; port: number; secure: boolean; user: string; pass: string; from: string }
export type MailSource = "admin" | "env" | "none";

const KEY = "mail";
let cache: { at: number; cfg: MailConfig | null; source: MailSource } | null = null;
let transport: Transporter | null = null;
/** Только для тестов: подмена транспорта, чтобы не слать настоящие письма. */
export const __setMailTransport = (t: Transporter | null) => { transport = t; };

function fromEnv(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim(), user = process.env.SMTP_USER?.trim(), pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 465;
  return { host, port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE.trim() === "true" : port === 465, user, pass, from: process.env.SMTP_FROM?.trim() || user };
}

async function load(): Promise<{ cfg: MailConfig | null; source: MailSource }> {
  if (cache && Date.now() - cache.at < 10_000) return cache;
  let cfg: MailConfig | null = null, source: MailSource = "none";
  try {
    const r = await one<{ value: { host?: string; port?: number; secure?: boolean; user?: string; from?: string; pass?: { enc: string } } }>("select value from kz_platform_settings where key=$1", [KEY]);
    const v = r?.value;
    if (v?.host && v.user && v.pass) {
      const pass = open(v.pass).pass;
      if (pass) { cfg = { host: v.host, port: v.port || 465, secure: v.secure ?? (v.port || 465) === 465, user: v.user, pass, from: v.from || v.user }; source = "admin"; }
    }
  } catch { /* до миграции 031 таблицы нет: работаем на переменных окружения */ }
  if (!cfg) { cfg = fromEnv(); if (cfg) source = "env"; }
  cache = { at: Date.now(), cfg, source };
  return cache;
}

export const mailState = async () => { const { cfg, source } = await load(); return { configured: !!cfg, source, host: cfg?.host ?? "", from: cfg?.from ?? "" }; };
export const mailConfigured = async () => !!(await load()).cfg || !!transport;

/** Администратор сохраняет настройки. Пустой пароль — оставить прежний. */
export async function saveMailConfig(i: { host: string; port: number; secure: boolean; user: string; pass: string; from: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const host = i.host.trim(), user = i.user.trim();
  if (!host || !/^[a-z0-9.-]+$/i.test(host)) return { ok: false, error: "Укажите адрес SMTP-сервера, например smtp.yandex.ru" };
  if (!Number.isInteger(i.port) || i.port < 1 || i.port > 65535) return { ok: false, error: "Порт должен быть числом от 1 до 65535" };
  if (!user) return { ok: false, error: "Укажите логин (обычно это адрес почты)" };
  let pass = i.pass.trim();
  if (!pass) { const old = await one<{ value: { pass?: { enc: string } } }>("select value from kz_platform_settings where key=$1", [KEY]); pass = old?.value?.pass ? open(old.value.pass).pass ?? "" : ""; }
  if (!pass) return { ok: false, error: "Укажите пароль (для Яндекса и Mail.ru это пароль приложения, не пароль от ящика)" };
  const value = { host, port: i.port, secure: i.secure, user, from: i.from.trim() || user, pass: seal({ pass }) };
  await q("insert into kz_platform_settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value, updated_at=now()", [KEY, JSON.stringify(value)]);
  transport = null; cache = null;
  return { ok: true };
}

export async function clearMailConfig(): Promise<void> {
  await q("delete from kz_platform_settings where key=$1", [KEY]);
  transport = null; cache = null;
}

async function getTransport(): Promise<{ t: Transporter; from: string }> {
  const { cfg } = await load();
  if (transport) return { t: transport, from: cfg?.from ?? "" };
  if (!cfg) throw new Error("Почта не настроена: заполните её в «Администрирование → Почта»");
  transport = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000, auth: { user: cfg.user, pass: cfg.pass } });
  return { t: transport, from: cfg.from };
}

export async function sendMail(m: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const { t, from } = await getTransport();
  await t.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html });
}

/** Простое письмо в фирменном виде: логотип текстом, кнопка и запасная ссылка. Стили встроены — почтовые клиенты не читают <style>. */
export function mailLayout(title: string, body: string, button?: { label: string; url: string }): { html: string; text: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html lang="ru"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1b2029">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;padding:32px">
<tr><td><div style="font-size:20px;font-weight:700;margin-bottom:16px">${esc(title)}</div>
<div style="font-size:15px;line-height:1.55;color:#3a424e">${body.split("\n").map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join("")}</div>
${button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#1c1b19;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-size:15px">${esc(button.label)}</a></p>
<p style="font-size:12px;color:#6b7480;margin:0">Если кнопка не нажимается, откройте ссылку:<br><a href="${esc(button.url)}" style="color:#0480b1;word-break:break-all">${esc(button.url)}</a></p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  return { html, text: `${title}\n\n${body}${button ? `\n\n${button.label}: ${button.url}` : ""}\n` };
}
