/** Общее для картинок к разделам статьи: работает и на сервере, и в браузере (в файле действий экспортировать можно только async-функции). */
export const H2 = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;

/** Вставляет картинку после n-го заголовка H2. Если раздел уже иллюстрирован (сразу за заголовком идёт figure), прежняя картинка заменяется. */
export function insertAfterH2(html: string, n: number, figure: string): string | null {
  const m = [...html.matchAll(H2)];
  const h = m[n];
  if (!h || h.index === undefined) return null;
  const end = h.index + h[0].length;
  const rest = html.slice(end).replace(/^\s*<figure>[\s\S]*?<\/figure>/i, "");
  return `${html.slice(0, end)}\n${figure}${rest}`;
}

export const SECTION_ASPECTS = { landscape: "Горизонтальная 3:2", square: "Квадрат 1:1", portrait: "Вертикальная 2:3" } as const;

