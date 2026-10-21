"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FONT_CATALOG } from "@/lib/fonts-catalog";

const KIND: Record<string, string> = { sans: "Без засечек", serif: "С засечками", display: "Акцидентные", hand: "Рукописные" };
const SAMPLE = "Съешь ещё этих мягких булок";

/**
 * Шрифт слайдов карусели и инфографики: из каталога (файлы лежат на сайте, превью берётся оттуда же) или любой шрифт Google Fonts по названию.
 * Значение уходит в скрытое поле font: slug каталога или «gf:Название». Пустое — шрифт по умолчанию (Inter).
 */
export function FontPicker({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [kind, setKind] = useState<string>("all");
  const [gf, setGf] = useState(initial.startsWith("gf:") ? initial.slice(3) : "");
  const [gfState, setGfState] = useState<{ busy?: boolean; ok?: boolean; text?: string }>(initial.startsWith("gf:") ? { ok: true } : {});

  // файлы каталога подключаем по требованию, чтобы страница без этого раздела их не грузила
  useEffect(() => {
    if (document.getElementById("brand-fonts-css")) return;
    const l = document.createElement("link"); l.id = "brand-fonts-css"; l.rel = "stylesheet"; l.href = "/fonts/fonts.css"; document.head.appendChild(l);
  }, []);
  const loadGoogle = (name: string) => {
    const id = `gf-${name.replace(/\W+/g, "-")}`;
    if (document.getElementById(id)) return;
    const l = document.createElement("link"); l.id = id; l.rel = "stylesheet"; l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}:wght@400;700&display=swap&subset=cyrillic`; document.head.appendChild(l);
  };
  useEffect(() => { if (initial.startsWith("gf:")) loadGoogle(initial.slice(3)); }, [initial]);

  const connect = async () => {
    const name = gf.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/.test(name)) { setGfState({ ok: false, text: "Введите название как в Google Fonts, например Rubik Mono One" }); return; }
    setGfState({ busy: true });
    try {
      const r = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}:wght@400;700&display=swap`);
      if (!r.ok) { setGfState({ ok: false, text: "Такого шрифта нет в Google Fonts" }); return; }
      loadGoogle(name); setValue(`gf:${name}`); setGfState({ ok: true, text: "Подключён. Если в шрифте нет кириллицы, в слайдах останется Inter." });
    } catch { setGfState({ ok: false, text: "Не удалось связаться с Google Fonts" }); }
  };

  const shown = FONT_CATALOG.filter((f) => kind === "all" || f.kind === kind);
  const gfName = value.startsWith("gf:") ? value.slice(3) : "";
  return (
    <div className="space-y-3">
      <input type="hidden" name="font" value={value} />
      <div className="flex flex-wrap gap-1.5">
        {["all", ...Object.keys(KIND)].map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`chip cursor-pointer !px-3 !py-1 text-xs ${kind === k ? "bg-accent-soft text-accent-ink" : ""}`} aria-pressed={kind === k}>{k === "all" ? "Все" : KIND[k]}</button>)}
      </div>
      <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
        <button type="button" onClick={() => setValue("")} aria-pressed={!value} className={`rounded-xl p-3 text-left ${!value ? "bg-accent-soft ring-1 ring-accent" : "bg-tile hover:bg-surface"}`}>
          <span className="block text-xs text-ink3">По умолчанию</span><span className="block text-base" style={{ fontFamily: "Inter, sans-serif" }}>Inter · {SAMPLE}</span>
        </button>
        {shown.map((f) => (
          <button key={f.slug} type="button" onClick={() => setValue(f.slug)} aria-pressed={value === f.slug} className={`rounded-xl p-3 text-left ${value === f.slug ? "bg-accent-soft ring-1 ring-accent" : "bg-tile hover:bg-surface"}`}>
            <span className="flex items-center justify-between text-xs text-ink3">{f.name}{value === f.slug && <CheckCircle2 size={13} className="text-accent-ink" />}</span>
            <span className="block truncate text-lg" style={{ fontFamily: `"${f.name}", sans-serif`, fontWeight: 700 }}>{SAMPLE}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2 rounded-xl bg-tile p-3">
        <label className="label">Google Fonts: любой другой шрифт по названию</label>
        <div className="flex flex-wrap gap-2">
          <input value={gf} onChange={(e) => setGf(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void connect(); } }} placeholder="например: Rubik Mono One" className="input !w-auto min-w-0 flex-1 !bg-surface !py-1.5 text-sm" />
          <button type="button" onClick={connect} disabled={gfState.busy} className="btn btn-ghost !py-1.5 text-xs">{gfState.busy && <Loader2 size={13} className="animate-spin" />}Подключить</button>
        </div>
        {gfName && <p className="text-lg" style={{ fontFamily: `"${gfName}", sans-serif`, fontWeight: 700 }}>{SAMPLE}</p>}
        {gfState.text && <p className={`text-xs ${gfState.ok ? "text-good" : "text-bad"}`}>{gfState.text}</p>}
        <p className="text-xs text-ink3">Список шрифтов: fonts.google.com. Нужен шрифт с кириллицей.</p>
      </div>
    </div>
  );
}
