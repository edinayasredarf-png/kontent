"use client";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { saveLogoPlacementAction } from "@/lib/actions";

const POS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const;
const POS_LABEL: Record<string, string> = { tl: "Слева вверху", tc: "Сверху по центру", tr: "Справа вверху", ml: "Слева по центру", mc: "По центру", mr: "Справа по центру", bl: "Слева внизу", bc: "Снизу по центру", br: "Справа внизу" };
const RATIO: Record<string, string> = { square: "1 / 1", portrait: "2 / 3", landscape: "3 / 2" };

/**
 * Где и каким размером логотип накладывается на картинки бренда. Образец показывает то же, что получится на готовой картинке:
 * размер — доля ширины, отступ — доля ширины от края (так же считает сервер при наложении).
 */
export function LogoPlacement({ brandId, logoUrl, aspect, initial, disabled }: { brandId: string; logoUrl: string; aspect: string; initial: { pos: string; scale: number; margin: number }; disabled: boolean }) {
  const [pos, setPos] = useState(initial.pos), [scale, setScale] = useState(initial.scale), [margin, setMargin] = useState(initial.margin);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const on = pos !== "none";
  const row = on ? pos[0] : "b", col = on ? pos[1] : "r";
  // позиция в процентах ширины образца; по вертикали отступ тоже в долях ширины, поэтому считаем через aspect-ratio контейнера
  const style: React.CSSProperties = {
    width: `${scale}%`,
    ...(col === "l" ? { left: `${margin}%` } : col === "r" ? { right: `${margin}%` } : { left: "50%", transform: "translateX(-50%)" }),
    ...(row === "t" ? { top: `${margin}%` } : row === "b" ? { bottom: `${margin}%` } : { top: "50%", transform: col === "c" ? "translate(-50%,-50%)" : "translateY(-50%)" }),
  };
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await saveLogoPlacementAction(brandId, pos, scale, margin).catch(() => null);
    setBusy(false);
    setMsg(r?.ok ? { ok: true, text: "Сохранено" } : { ok: false, text: r && !r.ok ? r.error : "Не удалось сохранить" });
  };
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <b className="text-sm">Где и каким размером накладывать</b>
      <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: RATIO[aspect] ?? "1 / 1", background: "linear-gradient(135deg,#7aa7ff 0%,#c58bff 50%,#ffb27a 100%)" }} aria-label="Образец картинки с логотипом">
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 30% 70%,#fff 0,transparent 45%)" }} />
        {on && /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoUrl} alt="" className="absolute h-auto object-contain" style={style} />}
        {!on && <span className="absolute inset-0 grid place-items-center text-xs text-white/90">Логотип не накладывается</span>}
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <span className="label">Положение</span>
          <div className="grid w-28 grid-cols-3 gap-1.5" role="radiogroup" aria-label="Положение логотипа">
            {POS.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={pos === p} aria-label={POS_LABEL[p]} title={POS_LABEL[p]} disabled={disabled} onClick={() => setPos(p)}
                className={`aspect-square rounded-lg border transition ${pos === p ? "border-accent bg-accent" : "border-line bg-tile hover:bg-surface"}`} />
            ))}
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-ink2"><input type="checkbox" checked={!on} disabled={disabled} onChange={(e) => setPos(e.target.checked ? "none" : "br")} />Не накладывать</label>
        </div>
        <div className="min-w-[10rem] flex-1 space-y-3">
          <label className="block text-xs text-ink2">Размер: {scale}% ширины
            <input type="range" min={4} max={40} value={scale} disabled={disabled || !on} onChange={(e) => setScale(Number(e.target.value))} className="mt-1 w-full" /></label>
          <label className="block text-xs text-ink2">Отступ от края: {margin}%
            <input type="range" min={1} max={12} value={margin} disabled={disabled || !on} onChange={(e) => setMargin(Number(e.target.value))} className="mt-1 w-full" /></label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={disabled || busy} className="btn btn-accent !py-2">{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Сохранить размещение</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-ink3">Действует для картинок, которые создаёт нейросеть. В каруселях логотип стоит в шапке слайда.</p>
    </div>
  );
}
