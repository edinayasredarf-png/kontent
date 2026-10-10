/** Разбор одного источника (статья, вебинар, свой текст) на несколько материалов с разными углами подачи. */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", laquo: "«", raquo: "»", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
  return ENT[e.toLowerCase()] ?? m;
});

/** Заголовок страницы: h1, иначе title. */
export function htmlTitle(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return decode(h1.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Основной текст страницы: берём <article> или <main>, убираем скрипты, меню и подвал, абзацы сохраняем. */
export function htmlToText(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside|button|select)\b[\s\S]*?<\/\1>/gi, " ");
  const main = h.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? h.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
  if (main && main.replace(/<[^>]+>/g, "").trim().length > 600) h = main;
  h = h.replace(/<\/(p|div|section|li|h[1-6]|tr|blockquote)>|<br\s*\/?>/gi, "\n").replace(/<li\b[^>]*>/gi, "• ").replace(/<[^>]+>/g, " ");
  return decode(h).replace(/[ \t\f\v]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const MIN_SOURCE = 400, MAX_SOURCE = 30_000;

/** Тема, хук и угол из ответа модели → чистые строки. Лишнее и пустое отбрасываем. */
export interface Angle { topic: string; hook: string; kind: string; angle: string; type?: string }
export function cleanAngles(arr: unknown[], kinds: string[], types: string[], max: number): Angle[] {
  const seen = new Set<string>();
  const out: Angle[] = [];
  for (const x of arr as Record<string, unknown>[]) {
    if (!x || typeof x !== "object") continue;
    const topic = String(x.topic ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (topic.length < 3 || seen.has(topic.toLowerCase())) continue;
    seen.add(topic.toLowerCase());
    out.push({
      topic, hook: String(x.hook ?? "").replace(/\s+/g, " ").trim().slice(0, 300), kind: kinds.includes(String(x.kind)) ? String(x.kind) : kinds[0],
      angle: String(x.angle ?? "").replace(/\s+/g, " ").trim().slice(0, 500), type: x.type && types.includes(String(x.type)) ? String(x.type) : undefined,
    });
    if (out.length >= max) break;
  }
  return out;
}
