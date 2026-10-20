import { createHash, timingSafeEqual } from "node:crypto";

// Сайт стоит за собственным nginx-прокси (Vercel режет российские IP). Vercel тогда видит IP прокси, а не посетителя,
// поэтому прокси передаёт настоящий IP в заголовке X-Opora-Client-IP, подписанном общим секретом PROXY_SECRET.
// Без верного секрета заголовок игнорируется, подделать его снаружи нельзя.
const SECRET = () => (process.env.PROXY_SECRET ?? "").trim().replace(/^["']+|["']+$/g, "");
const eq = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export function viaTrustedProxy(h: Headers): boolean {
  const s = SECRET(), got = h.get("x-opora-proxy-secret");
  return Boolean(s && got && eq(got, s));
}

/** IP посетителя: за доверенным прокси — из его заголовка, иначе первый адрес в x-forwarded-for (так работает прямой Vercel). */
export function clientIpFromHeaders(h: Headers): string {
  if (viaTrustedProxy(h)) {
    const ip = (h.get("x-opora-client-ip") ?? "").trim();
    if (ip) return ip.slice(0, 64);
  }
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim().slice(0, 64);
}
