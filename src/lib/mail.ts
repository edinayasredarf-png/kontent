import nodemailer, { type Transporter } from "nodemailer";

/** Те же переменные, что на единойсреде: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM. */
export const mailConfigured = () => !!process.env.SMTP_HOST?.trim() && !!process.env.SMTP_USER?.trim() && !!process.env.SMTP_PASS?.trim();

let transport: Transporter | null = null;
/** Только для тестов: подмена транспорта, чтобы не слать настоящие письма. */
export const __setMailTransport = (t: Transporter | null) => { transport = t; };

function getTransport(): Transporter {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE.trim() === "true" : port === 465;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(), port, secure, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASS!.trim() },
  });
  return transport;
}

export async function sendMail(m: { to: string; subject: string; text: string; html: string }): Promise<void> {
  if (!mailConfigured() && !transport) throw new Error("Почта не настроена (SMTP_HOST, SMTP_USER, SMTP_PASS)");
  await getTransport().sendMail({ from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim(), to: m.to, subject: m.subject, text: m.text, html: m.html });
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
