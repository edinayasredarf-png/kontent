import { lookup as dnsLookup } from "node:dns";
import net from "node:net";
import { Agent, fetch as ufetch } from "undici";

/**
 * Запросы по адресам, которые вводит пользователь. Главный риск — SSRF: адрес вида http://169.254.169.254/ или
 * http://localhost:5432 заставил бы наш сервер ходить во внутреннюю сеть. Защита в трёх местах:
 *  1) только http/https и порты 80/443;
 *  2) IP-адреса из DNS проверяются в момент соединения (а не заранее) — иначе подмена DNS между проверкой и запросом обходит защиту;
 *  3) редиректы идут вручную, каждый шаг проверяется заново.
 * ALLOW_PRIVATE_FETCH=1 отключает проверку адресов — ТОЛЬКО для локальных тестов, в проде не задавать.
 */
const allowPrivate = () => process.env.ALLOW_PRIVATE_FETCH === "1";

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const g = expandV6(ip);
    if (!g) return true;
    // IPv4 внутри IPv6: ::ffff:a.b.c.d (mapped), ::a.b.c.d (compat), 64:ff9b::a.b.c.d (NAT64). URL-парсер приводит их к hex-виду.
    const embedded = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
    const zero5 = g.slice(0, 5).every((x) => x === 0);
    if ((zero5 && (g[5] === 0xffff || g[5] === 0)) || (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0))) {
      if (zero5 && g[5] === 0 && g[6] === 0 && g[7] <= 1) return true; // :: и ::1
      return isPrivateIp(embedded);
    }
    const first = g[0];
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
  }
  return true; // не IP — сюда не попадаем, на всякий случай блокируем
}

/** Полная запись IPv6 в 8 групп по 16 бит. */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const v4 = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) s = s.replace(v4[0], ((+v4[1] << 8) | +v4[2]).toString(16) + ":" + ((+v4[3] << 8) | +v4[4]).toString(16));
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [], tl = tail !== undefined && tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - h.length - tl.length;
  if (fill < 0 || (tail === undefined && h.length !== 8)) return null;
  const all = [...h, ...Array(fill).fill("0"), ...tl].map((x) => parseInt(x, 16));
  return all.length === 8 && all.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? all : null;
}

type LookupCb = (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void;
function guardedLookup(hostname: string, opts: { all?: boolean; family?: number; hints?: number }, cb: LookupCb) {
  dnsLookup(hostname, { all: true, family: opts.family, hints: opts.hints }, (err, addrs) => {
    if (err) return cb(err, "", 0);
    const ok = addrs.filter((a) => allowPrivate() || !isPrivateIp(a.address));
    if (!ok.length) return cb(new Error("Адрес недоступен: внутренняя сеть запрещена"), "", 0);
    if (opts.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}

const agent = new Agent({ connect: { lookup: guardedLookup as never, timeout: 10_000 }, bodyTimeout: 15_000, headersTimeout: 10_000 });

export function checkUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Некорректный адрес"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Разрешены только http и https");
  if (u.username || u.password) throw new Error("Адрес с логином и паролем не поддерживается");
  if (!allowPrivate()) {
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    if (port !== "80" && port !== "443") throw new Error("Разрешены только порты 80 и 443");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isPrivateIp(host)) throw new Error("Адрес недоступен: внутренняя сеть запрещена");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Адрес недоступен: внутренняя сеть запрещена");
  }
  return u;
}

export interface Fetched { text: string; url: string; contentType: string }

/** Скачивание бинарного файла (картинка по ссылке из ответа модели) с теми же защитами. */
export async function safeFetchBuffer(raw: string, maxBytes = 12_000_000): Promise<{ data: Buffer; contentType: string }> {
  let url = checkUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await ufetch(url, { dispatcher: agent, redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; KontentBot/1.0)" } });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location"); await res.body?.cancel().catch(() => {});
      if (!loc) throw new Error("Редирект без адреса");
      url = checkUrl(new URL(loc, url).toString()); continue;
    }
    if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new Error(`Файл не скачался: ${res.status}`); }
    const chunks: Uint8Array[] = []; let size = 0; const reader = res.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > maxBytes) { await reader.cancel().catch(() => {}); throw new Error("Файл слишком большой"); }
      chunks.push(value);
    }
    return { data: Buffer.concat(chunks), contentType: res.headers.get("content-type") ?? "" };
  }
  throw new Error("Слишком много перенаправлений");
}

/** Произвольный запрос (POST и т. п.) на адрес пользователя: для WordPress и webhook. Те же защиты, редиректы не выполняются. */
export async function safeRequest(raw: string, o: { method: string; headers?: Record<string, string>; body?: Uint8Array | string | FormData; timeoutMs?: number; maxBytes?: number }): Promise<{ status: number; text: string }> {
  const url = checkUrl(raw);
  const res = await ufetch(url, { dispatcher: agent, method: o.method, redirect: "manual", signal: AbortSignal.timeout(o.timeoutMs ?? 30_000), headers: { "User-Agent": "KontentBot/1.0", ...(o.headers ?? {}) }, body: o.body as never });
  const chunks: Uint8Array[] = []; let size = 0; const max = o.maxBytes ?? 1_000_000; const reader = res.body?.getReader();
  if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel().catch(() => {}); break; } chunks.push(value); }
  return { status: res.status, text: Buffer.concat(chunks).toString("utf8") };
}

export async function safeFetchText(raw: string, opts: { maxBytes?: number; accept?: string; headers?: Record<string, string> } = {}): Promise<Fetched> {
  const max = opts.maxBytes ?? 2_000_000;
  let url = checkUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await ufetch(url, {
      dispatcher: agent, redirect: "manual", signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KontentBot/1.0)", Accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml,application/rss+xml,*/*", ...opts.headers },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!loc) throw new Error("Редирект без адреса");
      url = checkUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new Error(`Сайт ответил ${res.status}`); }
    const chunks: Uint8Array[] = []; let size = 0;
    const reader = res.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { await reader.cancel().catch(() => {}); break; } // обрезаем: хватит начала страницы
      chunks.push(value);
    }
    const ct = res.headers.get("content-type") ?? "";
    const cs = /charset=([\w-]+)/i.exec(ct)?.[1]?.toLowerCase();
    let text: string;
    try { text = new TextDecoder(cs && cs !== "utf-8" ? cs : "utf-8").decode(Buffer.concat(chunks)); } catch { text = Buffer.concat(chunks).toString("utf8"); }
    return { text, url: url.toString(), contentType: ct };
  }
  throw new Error("Слишком много перенаправлений");
}
