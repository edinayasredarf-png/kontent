/** Модели пишут markdown, а Telegram/VK его не рендерят (без parse_mode). Приводим к чистому тексту. */
export function toPlain(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}[ \t]+(.+)$/gm, "$1") // заголовок markdown — «#» с пробелом; хештег «#слово» в начале строки не трогаем
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
    .replace(/^[ \t]*[-*][ \t]+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Делит длинный текст на части ≤ max, стараясь резать по абзацам, затем по предложениям. */
export function chunk(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  const push = (s: string) => { if (s) out.push(s); };
  for (const para of text.split("\n\n")) {
    if ((cur ? cur + "\n\n" : "").length + para.length <= max) { cur = cur ? cur + "\n\n" + para : para; continue; }
    push(cur); cur = "";
    if (para.length <= max) { cur = para; continue; }
    for (const sent of para.split(/(?<=[.!?…])\s+/)) {
      if ((cur ? cur + " " : "").length + sent.length <= max) cur = cur ? cur + " " + sent : sent;
      else { push(cur); cur = sent.slice(0, max); for (let i = max; i < sent.length; i += max) { push(cur); cur = sent.slice(i, i + max); } }
    }
  }
  push(cur);
  return out;
}
