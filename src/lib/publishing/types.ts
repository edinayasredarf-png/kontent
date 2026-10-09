export interface Article { title: string; description: string; slug: string; keywords: string[]; html: string }
export interface PublishInput { text: string; image?: { data: Buffer; mime: string }; article?: Article }
/** warning — публикация прошла, но что-то (например, картинка) не удалось: пост ушёл без неё. */
export interface PublishOutput { externalId: string; url: string | null; warning?: string }

/** retryable=true — временный сбой (лимиты, 5xx, сеть): воркер повторит позже. */
export class PublishError extends Error {
  constructor(message: string, public retryable = false) { super(message); }
}

export interface Provider {
  kind: "telegram" | "vk" | "wordpress" | "webhook" | "max";
  /** Проверка при подключении: токен рабочий, бот/сообщество доступны. Возвращает человекочитаемое имя. */
  verify(cred: Record<string, string>): Promise<string>;
  publish(input: PublishInput, cred: Record<string, string>): Promise<PublishOutput>;
}
