import http from "node:http";
import type { AddressInfo } from "node:net";

export type Hit = { path: string; params: Record<string, string>; body?: Buffer };
type Handler = (h: Hit) => unknown;

/** Поддельный VK: методы API (/method/<имя>), адреса загрузки (/upload/<имя>) и VK ID (/oauth2/*). Реальные запросы к VK тесты не делают. */
export async function mockVk() {
  const hits: Hit[] = [];
  const handlers = new Map<string, Handler>();
  const srv = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const path = new URL(req.url!, "http://x").pathname;
      const ct = req.headers["content-type"] ?? "";
      const params: Record<string, string> = ct.includes("urlencoded") ? Object.fromEntries(new URLSearchParams(raw.toString())) : {};
      const hit: Hit = { path, params, body: raw };
      hits.push(hit);
      const h = handlers.get(path);
      const out = h ? h(hit) : { error: { error_code: 100, error_msg: `нет обработчика ${path}` } };
      if (out === "__hang") return; // имитация обрыва: ответа нет
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return {
    base, hits,
    on: (path: string, h: Handler) => void handlers.set(path, h),
    clear: () => { hits.length = 0; handlers.clear(); },
    count: (path: string) => hits.filter((x) => x.path === path).length,
    last: (path: string) => [...hits].reverse().find((x) => x.path === path),
    close: () => new Promise<void>((r) => { srv.closeAllConnections?.(); srv.close(() => r()); }),
  };
}

export const ok = (response: unknown) => ({ response });
export const fail = (error_code: number, error_msg: string) => ({ error: { error_code, error_msg } });
