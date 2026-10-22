/** Опрос материала и его текст для площадок. Чистые функции: их используют и публикация, и предпросмотр, поэтому вид совпадает. */
export interface PollMeta { question: string; options: string[]; /** options — с вариантами ответов, open — открытый вопрос без вариантов */ mode?: "options" | "open"; /** можно выбрать несколько вариантов (встроенный опрос Telegram) */ multi?: boolean }

export const POLL_MIN = 2, POLL_MAX = 10;
export const hasOptions = (p: PollMeta | null | undefined): boolean => !!p && p.mode !== "open" && p.options.length >= POLL_MIN;

/**
 * Текст публикации. Telegram с вариантами получает встроенный опрос, поэтому к нему идёт только вводный текст. Остальные площадки (и открытый вопрос
 * везде) получают вопрос в тексте; у варианта номер, голосуют цифрой в комментариях.
 */
export function pollText(body: string, poll: PollMeta | undefined, channelKind: string): string {
  if (!poll) return body;
  if (channelKind === "telegram" && hasOptions(poll)) return body;
  const lead = body.trim() ? `${body.trim()}\n\n` : "";
  if (!hasOptions(poll)) return `${lead}${poll.question}\n\nОтветы — в комментариях.`;
  const opts = poll.options.map((o, i) => `${i + 1}. ${o}`).join("\n");
  return `${lead}${poll.question}\n\n${opts}\n\n${poll.multi ? "Можно выбрать несколько вариантов. " : ""}Голосуйте в комментариях: напишите цифру варианта.`;
}
