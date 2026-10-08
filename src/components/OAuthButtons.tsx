import { configured, PROVIDER_NAME, PROVIDERS, type Provider } from "@/lib/oauth";

const ICON: Record<Provider, React.ReactNode> = {
  yandex: <svg viewBox="0 0 24 24" className="size-5" aria-hidden><circle cx="12" cy="12" r="12" fill="#FC3F1D" /><path d="M13.6 18.5h-1.9V8.2h-.9c-1.5 0-2.3.8-2.3 1.9 0 1.3.6 1.9 1.7 2.6l.9.6-2.6 3.9H6.4L8.7 13c-1.3-1-2-1.9-2-3.5 0-2 1.4-3.5 4.1-3.5h2.8v12.5Z" fill="#fff" /></svg>,
  vk: <svg viewBox="0 0 24 24" className="size-5" aria-hidden><rect width="24" height="24" rx="6" fill="#0077FF" /><path d="M12.8 17c-4.4 0-6.9-3-7-8h2.2c.1 3.7 1.7 5.200 3 5.5V9h2.100v3.200c1.300-.1 2.600-1.600 3.100-3.200h2.100c-.4 2-1.800 3.500-2.800 4.100 1 .5 2.600 1.700 3.200 3.900h-2.300c-.5-1.500-1.700-2.700-3.300-2.900V17h-.1Z" fill="#fff" /></svg>,
};

/** Кнопки показываются только для настроенных провайдеров — иначе нажатие вело бы в никуда. */
export function OAuthButtons({ verb }: { verb: string }) {
  const on = PROVIDERS.filter(configured);
  if (!on.length) return null;
  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3 text-xs text-ink3"><span className="h-px flex-1 bg-line" />или<span className="h-px flex-1 bg-line" /></div>
      <div className="grid gap-2">
        {on.map((p) => (
          // обычная ссылка, не <Link>: нужен полный переход, чтобы сервер поставил cookie со state
          <a key={p} href={`/api/oauth/${p}/start`} className="btn btn-ghost justify-center !py-2.5">{ICON[p]}{verb} через {PROVIDER_NAME[p]}</a>
        ))}
      </div>
    </div>
  );
}
