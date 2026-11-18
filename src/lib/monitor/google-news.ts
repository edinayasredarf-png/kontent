import { parse } from "node-html-parser";
import { safeFetchText, safeRequest } from "../safefetch";

export function isGoogleNews(raw: string): boolean {
  try { return new URL(raw).hostname === "news.google.com"; } catch { return false; }
}

function publisher(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      && !/(^|\.)(google\.com|googleusercontent\.com)$/.test(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function googleNewsResult(text: string): string | null {
  // batchexecute wraps JSON records in an anti-XSSI prefix and length frames.
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("[")) continue;
    try {
      for (const row of JSON.parse(line)) {
        if (row?.[0] !== "wrb.fr" || row[1] !== "Fbv4je" || typeof row[2] !== "string") continue;
        const result = JSON.parse(row[2]);
        if (result[0] === "garturlres") return publisher(result[1]);
      }
    } catch { /* Ignore framing and unrelated records. */ }
  }
  return null;
}

export async function resolveGoogleNews(raw: string): Promise<string> {
  if (!isGoogleNews(raw)) return raw;
  const url = new URL(raw);
  const id = url.pathname.match(/^\/(?:rss\/)?articles\/([A-Za-z0-9_-]+)$/)?.[1];
  if (!id || id.length > 4000) throw new Error("У Google Новости нет корректной ссылки на статью");
  // Older RSS identifiers contain an explicit publisher URL.
  const legacy = Buffer.from(id, "base64url").toString("latin1").match(/https?:\/\/[^\x00-\x20\x7f-\xff]+/)?.[0];
  if (legacy) {
    const decoded = publisher(legacy);
    if (decoded) return decoded;
  }
  const page = await safeFetchText(`https://news.google.com/rss/articles/${id}?hl=ru&gl=RU&ceid=RU:ru`, { maxBytes: 2_000_000 });
  if (!isGoogleNews(page.url)) {
    const redirected = publisher(page.url);
    if (redirected) return redirected;
  }
  const element = parse(page.text).querySelector("[data-n-a-sg][data-n-a-ts]");
  const signature = element?.getAttribute("data-n-a-sg");
  const timestamp = element?.getAttribute("data-n-a-ts");
  if (!signature || !/^\d{1,15}$/.test(timestamp ?? "")) throw new Error("Google Новости не вернул адрес издателя");
  const context = [["X", "X", ["X", "X"], null, null, 1, 1, "RU:ru", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0];
  const payload = JSON.stringify(["garturlreq", context, id, Number(timestamp), signature]);
  const response = await safeRequest("https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "f.req": JSON.stringify([[["Fbv4je", payload, null, "generic"]]]) }).toString(),
    maxBytes: 1_000_000, timeoutMs: 15_000,
  });
  const result = response.status === 200 && googleNewsResult(response.text);
  if (!result) throw new Error("Не удалось получить оригинал новости у Google");
  return result;
}
