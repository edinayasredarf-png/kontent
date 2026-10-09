import { configured, PROVIDERS, type Provider } from "@/lib/oauth";

/** Знаки провайдеров: Яндекс — красный круг с «Я», VK ID — «VK» на белом скруглённом квадрате. Простые фигуры вместо вставленных path, чтобы ничего не искажалось. */
const MARK: Record<Provider, React.ReactNode> = {
  yandex: <span aria-hidden className="grid size-6 place-items-center rounded-full bg-[#FC3F1D] text-[13px] font-bold leading-none text-white">Я</span>,
  vk: <span aria-hidden className="grid size-6 place-items-center rounded-md bg-white text-[11px] font-extrabold leading-none tracking-tight text-[#0077FF]">VK</span>,
};

/** Цвета по гайдлайнам: VK ID — синий #0077FF, Яндекс ID — чёрная кнопка. Радиус тот же, что у остальных кнопок сайта (rounded-xl). */
const STYLE: Record<Provider, string> = {
  yandex: "bg-black text-white hover:bg-[#1c1c1c]",
  vk: "bg-[#0077FF] text-white hover:bg-[#006AE6]",
};
const LABEL: Record<Provider, string> = { yandex: "Яндекс ID", vk: "VK ID" };

/** Кнопки показываются только для настроенных провайдеров — иначе нажатие вело бы в никуда. */
export function OAuthButtons({ verb }: { verb: string }) {
  const on = PROVIDERS.filter(configured);
  if (!on.length) return null;
  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3 text-xs text-ink3"><span className="h-px flex-1 bg-line" />или<span className="h-px flex-1 bg-line" /></div>
      <div className="grid gap-2.5">
        {on.map((p) => (
          // обычная ссылка, не <Link>: нужен полный переход, чтобы сервер поставил cookie со state и PKCE
          <a key={p} href={`/api/oauth/${p}/start`} className={`flex h-11 items-center justify-center gap-2.5 rounded-xl px-4 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 ${STYLE[p]}`}>
            {MARK[p]}<span>{verb} через {LABEL[p]}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
