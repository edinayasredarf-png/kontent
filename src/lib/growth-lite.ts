/** Выбор текста под площадку: версия канала, если она создана, иначе основной текст. Отдельный файл, чтобы pipeline не зависел от growth. */
export function textForChannel(body: string, variants: Record<string, string> | undefined, channelKind: string): string {
  const v = variants?.[channelKind];
  return v && v.trim() ? v : body;
}
