/** Работа с HTML статьи в браузере: чистый текст без тегов, безопасный предпросмотр и список разделов. Только для клиентских компонентов (нужен DOMParser). */

const BLOCK = new Set(["P", "H1", "H2", "H3", "H4", "LI", "BLOCKQUOTE", "TR", "FIGCAPTION", "PRE"]);

/** Текст статьи без тегов: абзацы разделены пустой строкой, заголовки отдельными строками, пункты списка с «•». */
export function htmlToPlain(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out: string[] = [];
  const walk = (n: Node) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === Node.ELEMENT_NODE) {
        const el = c as HTMLElement;
        if (["SCRIPT", "STYLE", "IMG"].includes(el.tagName)) return;
        if (el.tagName === "FIGURE") { const cap = el.querySelector("figcaption")?.textContent?.trim(); if (cap) out.push(cap); return; }
        if (el.tagName === "UL" || el.tagName === "OL") { walk(el); return; }
        if (el.tagName === "TABLE") { el.querySelectorAll("tr").forEach((tr) => out.push([...tr.children].map((x) => x.textContent?.trim() ?? "").join(" | "))); return; }
        if (BLOCK.has(el.tagName)) {
          const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
          if (t) out.push(el.tagName === "LI" ? `• ${t}` : t);
          return;
        }
        walk(el);
      } else if (c.nodeType === Node.TEXT_NODE) {
        const t = (c.textContent ?? "").replace(/\s+/g, " ").trim();
        if (t) out.push(t);
      }
    });
  };
  walk(doc.body);
  // между абзацами и заголовками пустая строка, между пунктами одного списка — нет
  return out.reduce((acc, line, i) => (i === 0 ? line : `${acc}${line.startsWith("• ") && out[i - 1].startsWith("• ") ? "\n" : "\n\n"}${line}`), "").trim();
}

/** HTML для предпросмотра: без скриптов, стилей, встроенных обработчиков и опасных ссылок. */
export function safePreviewHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,link,meta,form,input,button").forEach((n) => n.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      const v = a.value.trim().toLowerCase();
      if (a.name.startsWith("on") || ((a.name === "href" || a.name === "src") && (v.startsWith("javascript:") || v.startsWith("data:text")))) el.removeAttribute(a.name);
    }
    if (el.tagName === "A") { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener noreferrer"); }
  });
  return doc.body.innerHTML;
}

/** Разделы статьи: заголовки H2 по порядку. Нужны для подбора картинок к разделам. */
export function h2Titles(html: string): string[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return [...doc.querySelectorAll("h2")].map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim());
}
