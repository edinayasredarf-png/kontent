export interface PublishInput { text: string }
export interface PublishOutput { externalId: string; url: string | null }

/** retryable=true — временный сбой (лимиты, 5xx, сеть): воркер повторит позже. */
export class PublishError extends Error {
  constructor(message: string, public retryable = false) { super(message); }
}

export interface Provider {
  kind: "telegram" | "vk";
  /** Проверка при подключении: токен рабочий, бот/сообщество доступны. Возвращает человекочитаемое имя. */
  verify(cred: Record<string, string>): Promise<string>;
  publish(input: PublishInput, cred: Record<string, string>): Promise<PublishOutput>;
}
