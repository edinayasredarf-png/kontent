import { createHmac } from "node:crypto";
import { safeRequest } from "../safefetch";
import { CONNECTOR_CHANNELS, type ConnectorKind } from "./catalog";
import { PublishError, type Provider } from "./types";
import { media } from "./http";

/** Explicit contract: a generic webhook 200 is never proof of publication on a named platform. */
async function send(kind: ConnectorKind, c: Record<string, string>, payload: Record<string, unknown>, final = false, request: typeof safeRequest = safeRequest) {
  let u: URL; try { u = new URL(c.target); } catch { throw new PublishError("Укажите HTTPS-адрес внешнего коннектора."); }
  if (u.protocol !== "https:" || u.username || u.password || !c.token || !c.account) throw new PublishError("Нужны HTTPS-адрес коннектора, секрет подписи и ID аккаунта назначения.");
  const body = JSON.stringify({ version: 1, platform: kind, account: c.account, ...payload }), timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", c.token).update(`${timestamp}.${body}`).digest("hex");
  let r: { status: number; text: string };
  try { r = await request(u.href, { method: "POST", headers: { "Content-Type": "application/json", "X-Timestamp": timestamp, "X-Signature": `sha256=${signature}` }, body, timeoutMs: 30000 }); }
  catch { throw new PublishError("Коннектор не подтвердил ответ. Проверьте его журнал перед повторной отправкой.", !final); }
  if (r.status !== 200) throw new PublishError(`Коннектор: HTTP ${r.status}. Публикация не подтверждена.`, r.status === 429);
  let j: Record<string, unknown>; try { j = JSON.parse(r.text); } catch { throw new PublishError("Коннектор должен вернуть JSON с подтверждением площадки и аккаунта."); }
  if (!j || typeof j !== "object" || j.ok !== true || j.platform !== kind || j.account !== c.account) throw new PublishError("Коннектор не подтвердил выбранную площадку и аккаунт. Проверьте его настройку.");
  return j;
}
export function connector(kind: ConnectorKind, request: typeof safeRequest = safeRequest): Provider {
  return {
    kind,
    async verify(c) {
      const j = await send(kind, c, { event: "integration.verify" }, false, request);
      if (!Array.isArray(j.capabilities) || !j.capabilities.some(v => ["text", "image", "carousel", "article"].includes(v))) throw new PublishError("Коннектор должен сообщить поддерживаемые форматы: text, image, carousel, article.");
      return `${CONNECTOR_CHANNELS[kind]} · ${typeof j.name === "string" ? j.name.slice(0, 100) : c.account}`;
    },
    async publish(input, c) {
      if (!input.publicationId) throw new PublishError("Коннектору нужен уникальный ID публикации.");
      const images = media(input), format = input.article ? "article" : images.length > 1 ? "carousel" : images.length ? "image" : "text";
      const verified = await send(kind, c, { event: "integration.verify" }, false, request);
      if (!Array.isArray(verified.capabilities) || !verified.capabilities.includes(format)) throw new PublishError(`Коннектор ${CONNECTOR_CHANNELS[kind]} не поддерживает формат ${format}. Для видеоплощадок настройте создание и загрузку видео во внешнем сценарии.`);
      if (images.reduce((n, i) => n + i.data.length, 0) > 15_000_000) throw new PublishError("Коннектор: изображения суммарно больше 15 МБ. Уменьшите размер материала.");
      const j = await send(kind, c, { event: "publication.publish", publication_id: input.publicationId, format, text: input.text, article: input.article ?? null, images: images.map((i, order) => ({ order, mime: i.mime, base64: i.data.toString("base64"), url: input.imageUrls?.[order] ?? (order === 0 ? input.imageUrl : undefined) })) }, true, request);
      if (j.publication_id !== input.publicationId || j.status !== "published" || typeof j.id !== "string" || !j.id || typeof j.url !== "string") throw new PublishError("Коннектор не подтвердил публикацию. Нужны status=published, publication_id, id и url готового поста. Проверьте журнал коннектора перед повторной отправкой.");
      let url: URL; try { url = new URL(j.url); } catch { throw new PublishError("Коннектор вернул некорректный адрес поста."); }
      if (url.protocol !== "https:") throw new PublishError("Коннектор должен вернуть HTTPS-ссылку опубликованного поста.");
      return { externalId: j.id, url: url.href };
    },
  };
}
