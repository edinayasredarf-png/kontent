"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUp, Bookmark, Check, ChevronDown, Download, ImageIcon, Layers, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2, Type, X, Wallet } from "lucide-react";
import { QUALITY, FORMATS, slidePrice, type ImgModel, type QualityKey, type FormatKey } from "@/lib/creator/consts";
import type { StudioSettings } from "@/lib/creator/actions";
import type { PresetRow } from "@/lib/creator/data";
import { deletePresetAction, dropStudioAssetsAction, planCarouselAction, recomposeSlideAction, saveWorkAction, savePresetAction } from "@/lib/creator/actions";
import type { PlanSlide } from "@/lib/creator/plan";
import { GenOrb } from "./GenOrb";

export interface FactoryOpt { id: string; name: string; brandId: string; brand: string; hasLogo: boolean }
type SlideState = { status: "wait" | "run" | "ok" | "err"; finalId?: string; bgId?: string; error?: string; startedAt?: number };
type Phase = "compose" | "planning" | "plan" | "making";
const rub = (kop: number) => `${(kop / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
const img = (id: string, dl = false) => `/api/assets/${id}${dl ? "?dl=1" : ""}`;
const EXAMPLES = ["5 ошибок, из-за которых клиенты не доходят до покупки", "Как мы упаковываем заказ: путь товара от склада до двери", "Ссылка на новость отрасли + наш комментарий экспертов"];
const POS: [string, string][] = [["tl", "Сверху слева"], ["tr", "Сверху справа"], ["bl", "Снизу слева"], ["br", "Снизу справа"], ["bc", "Снизу по центру"], ["tc", "Сверху по центру"]];

function Pop({ trigger, children, wide }: { trigger: ReactNode; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-xl bg-tile px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-tile2">{trigger}<ChevronDown size={12} className="text-ink3" /></button>
      {open && <div className={`absolute bottom-full left-0 z-30 mb-2 max-h-80 overflow-auto rounded-2xl border border-line bg-surface p-2 shadow-xl ${wide ? "w-80" : "w-64"}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
const Opt = ({ on, onClick, title, price, hint }: { on: boolean; onClick: () => void; title: string; price?: string; hint?: string }) => (
  <button type="button" onClick={onClick} className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left ${on ? "bg-accent-soft" : "hover:bg-tile"}`}>
    <span className="min-w-0 flex-1"><span className={`block text-sm font-medium ${on ? "text-accent-ink" : ""}`}>{title}{price && <span className="ml-2 text-xs font-normal text-ink3">{price}</span>}</span>{hint && <span className="block text-xs text-ink3">{hint}</span>}</span>
    {on && <Check size={15} className="mt-0.5 shrink-0 text-accent" />}
  </button>
);

export function CarouselStudio({ factories, models, presets: initPresets, balanceKop, unlimited }: { factories: FactoryOpt[]; models: ImgModel[]; presets: PresetRow[]; balanceKop: number; unlimited: boolean }) {
  const router = useRouter();
  const [fid, setFid] = useState(factories[0]?.id ?? "");
  const fac = factories.find((f) => f.id === fid);
  const [prompt, setPrompt] = useState("");
  const [S, setS] = useState<StudioSettings>({ model: models[0]?.id ?? "", quality: "1k", format: "portrait", n: 5, textInImage: false, logo: !!factories[0]?.hasLogo, logoPos: "br", style: "", structure: "" });
  const set = (p: Partial<StudioSettings>) => setS((x) => ({ ...x, ...p }));
  const [phase, setPhase] = useState<Phase>("compose");
  const [plan, setPlan] = useState<{ slides: PlanSlide[]; caption: string; style: string } | null>(null);
  const [sl, setSl] = useState<SlideState[]>([]);
  const [err, setErr] = useState("");
  const [presets, setPresets] = useState(initPresets);
  const [presetName, setPresetName] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; factoryId: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [edit, setEdit] = useState<number | null>(null);
  const live = useRef({ plan, sl, S, fid });
  live.current = { plan, sl, S, fid };

  const model = models.find((m) => m.id === S.model) ?? models[0];
  const per = model ? slidePrice(model, S.quality) : 0;
  const count = plan ? plan.slides.length : S.n;
  const total = per * count;
  const short = !unlimited && total > balanceKop;
  const patch = (i: number, p: Partial<SlideState>) => setSl((a) => a.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const allOk = sl.length > 0 && sl.every((x) => x.status === "ok");
  const running = sl.some((x) => x.status === "run" || x.status === "wait");
  const hasLogo = !!fac?.hasLogo;

  const pickFactory = (id: string) => { setFid(id); const f = factories.find((x) => x.id === id); set({ logo: !!f?.hasLogo && S.logo }); };

  async function makePlan() {
    setErr("");
    if (!fid) return setErr("Сначала создайте завод: из него берутся бренд, тон и аудитория");
    if (prompt.trim().length < 8) return setErr("Опишите тему хотя бы одним предложением");
    setPhase("planning");
    const r = await planCarouselAction(fid, prompt, S);
    if (!r.ok) { setErr(r.error); return setPhase("compose"); }
    setPlan({ slides: r.plan.slides, caption: r.plan.caption, style: r.plan.style });
    setSl(r.plan.slides.map(() => ({ status: "wait" })));
    setSaved(null); setPhase("plan");
  }

  const one = useCallback(async (i: number) => {
    const { plan: p, S: st, fid: f } = live.current;
    if (!p) return;
    patch(i, { status: "run", startedAt: Date.now(), error: undefined });
    try {
      const res = await fetch("/api/creator/slide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factoryId: f, index: i, total: p.slides.length, slide: p.slides[i], style: p.style, settings: st }) });
      const j = (await res.json()) as { ok: boolean; finalId?: string; bgId?: string; error?: string };
      if (j.ok && j.finalId && j.bgId) {
        const old = live.current.sl[i];
        if (old?.finalId) void dropStudioAssetsAction([old.finalId, old.bgId ?? ""]);
        patch(i, { status: "ok", finalId: j.finalId, bgId: j.bgId });
      } else patch(i, { status: "err", error: j.error ?? "Не получилось" });
    } catch { patch(i, { status: "err", error: "Нет связи с сервером. Если деньги списались, они вернутся сами; проверьте баланс и повторите" }); }
  }, []);

  async function run(idx: number[]) {
    setPhase("making"); setErr("");
    setSl((a) => a.map((x, k) => (idx.includes(k) ? { status: "wait" } : x)));
    const queue = [...idx];
    const worker = async () => { while (queue.length) await one(queue.shift()!); };
    await Promise.all([worker(), worker()]);
    router.refresh(); // обновляем баланс в шапке
  }

  async function saveWork() {
    if (!plan) return;
    setBusy("save"); setErr("");
    const r = await saveWorkAction({ factoryId: fid, topic: prompt.slice(0, 140), caption: plan.caption, slides: plan.slides, finalIds: sl.map((x) => x.finalId!), bgIds: sl.map((x) => x.bgId!), style: plan.style, settings: S });
    setBusy("");
    if (r.ok) { setSaved({ id: r.id, factoryId: r.factoryId }); router.refresh(); } else setErr(r.error);
  }

  async function recompose(i: number, text?: { title: string; body: string }) {
    if (!plan || !sl[i]?.bgId) return;
    const s = text ?? plan.slides[i];
    const r = await recomposeSlideAction(fid, sl[i].bgId!, i, plan.slides.length, s, S, S.textInImage && !!model?.text);
    if (!r.ok) return setErr(r.error);
    void dropStudioAssetsAction([sl[i].finalId ?? ""]);
    patch(i, { finalId: r.finalId });
    if (text) setPlan((p) => p && { ...p, slides: p.slides.map((x, k) => (k === i ? { ...x, ...text } : x)) });
  }
  async function applyLogoAll() { setBusy("logo"); setErr(""); for (let i = 0; i < sl.length; i++) await recompose(i); setBusy(""); setSaved(null); }

  async function savePreset() {
    if (presetName === null || !plan) return;
    setBusy("preset");
    const structure = `${plan.slides.length} слайдов: обложка, ${plan.slides.length - 2} смысловых, призыв к действию`;
    const r = await savePresetAction(presetName, { ...S, structure }, plan.style, sl[0]?.finalId ?? null, fac?.brandId ?? null);
    setBusy("");
    if (!r.ok) return setErr(r.error);
    setPresets((p) => [{ id: r.id, name: presetName.trim(), settings: { ...S, structure, style: plan.style }, sample: sl[0]?.finalId ?? null, brand_id: fac?.brandId ?? null }, ...p]);
    setPresetName(null);
  }

  const reset = () => { setPhase("compose"); setPlan(null); setSl([]); setSaved(null); setErr(""); setPrompt(""); };
  const aspect = S.format === "portrait" ? "aspect-[4/5]" : "aspect-square";
  const noModel = !model;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-5xl flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/app/studio" className="inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Студия</Link>
        <h1 className="ml-1 flex items-center gap-2 text-xl font-semibold"><Layers size={20} className="text-accent" />Карусель</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select className="input !w-auto !py-1.5 text-xs" value={fid} onChange={(e) => pickFactory(e.target.value)} disabled={phase === "making" && running} aria-label="Завод">
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.brand}</option>)}
          </select>
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-tile px-2.5 py-1.5 text-xs"><Wallet size={13} className="text-ink3" />{unlimited ? "Безлимит" : rub(balanceKop)}</span>
          <Pop trigger={<><Bookmark size={13} />Пресеты{presets.length ? ` · ${presets.length}` : ""}</>} wide>
            {(close) => presets.length === 0 ? <p className="p-3 text-xs text-ink3">Пресетов пока нет. Создайте карусель и нажмите «Сохранить как пресет»: стиль серии, модель и качество запомнятся.</p> : presets.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-tile">
                {p.sample ? <img src={img(p.sample)} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-tile2"><ImageIcon size={16} className="text-ink3" /></span>}
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setS((x) => ({ ...x, ...p.settings, logo: hasLogo && p.settings.logo })); close(); }}>
                  <span className="block truncate text-sm font-medium">{p.name}</span><span className="block truncate text-[11px] text-ink3">{models.find((m) => m.id === p.settings.model)?.label ?? "модель недоступна"} · {QUALITY[p.settings.quality]?.label} · {p.settings.n} сл.</span>
                </button>
                <button type="button" aria-label="Удалить пресет" className="rounded-lg p-1.5 text-ink3 hover:text-bad" onClick={() => { void deletePresetAction(p.id); setPresets((a) => a.filter((x) => x.id !== p.id)); }}><Trash2 size={14} /></button>
              </div>))}
          </Pop>
        </div>
      </div>

      {/* холст */}
      <div className="flex-1">
        {phase === "compose" && (
          <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-line p-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent"><Sparkles size={22} /></div>
              <p className="font-medium">Опишите карусель: ИИ разобьёт тему на слайды и нарисует отдельную картинку к каждому</p>
              <p className="mt-1 text-sm text-ink2">Можно вставить ссылку на новость или статью: факты возьмём оттуда. Перед запуском вы увидите план и цену.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">{EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setPrompt(x)} className="rounded-full bg-tile px-3 py-1.5 text-xs text-ink2 hover:bg-tile2">{x}</button>)}</div>
            </div>
          </div>
        )}

        {phase === "planning" && <div className="grid min-h-72 place-items-center rounded-3xl border border-line"><GenOrb startedAt={Date.now()} typical={20} label="Разбираю тему на слайды и придумываю картинки…" /></div>}

        {phase === "plan" && plan && (
          <div className="space-y-4">
            <div className="card p-4 text-sm"><b>План готов: {plan.slides.length} слайдов.</b> <span className="text-ink2">Проверьте текст и описание картинки каждого слайда. Правки бесплатны, деньги списываются только за создание картинок.</span></div>
            <div className="card p-4">
              <p className="mb-2 text-sm font-medium">Добавить логотип на слайды?</p>
              {hasLogo ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => set({ logo: true })} className={`rounded-full px-3 py-1.5 text-sm ${S.logo ? "bg-accent text-white" : "bg-tile text-ink2 hover:bg-tile2"}`}>Да, добавить</button>
                  <button type="button" onClick={() => set({ logo: false })} className={`rounded-full px-3 py-1.5 text-sm ${!S.logo ? "bg-accent text-white" : "bg-tile text-ink2 hover:bg-tile2"}`}>Нет, без логотипа</button>
                  {S.logo && <select className="input !w-auto !py-1.5 text-sm" value={S.logoPos} onChange={(e) => set({ logoPos: e.target.value as StudioSettings["logoPos"] })} aria-label="Положение логотипа">{POS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
                </div>
              ) : <p className="text-sm text-ink2">У бренда «{fac?.brand}» не загружен логотип, поэтому слайды будут без него. <Link href="/app/brands" className="text-accent hover:underline">Загрузить в «Брендах»</Link></p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {plan.slides.map((s, i) => (
                <div key={i} className="card space-y-2 p-4">
                  <div className="flex items-center justify-between"><span className="text-xs font-medium text-ink3">Слайд {i + 1}{i === 0 ? " · обложка" : i === plan.slides.length - 1 ? " · призыв" : ""}</span>
                    {plan.slides.length > 3 && <button type="button" aria-label="Убрать слайд" className="text-ink3 hover:text-bad" onClick={() => { setPlan({ ...plan, slides: plan.slides.filter((_, k) => k !== i) }); setSl((a) => a.filter((_, k) => k !== i)); }}><X size={14} /></button>}</div>
                  <input className="input" maxLength={90} value={s.title} aria-label="Заголовок" onChange={(e) => setPlan({ ...plan, slides: plan.slides.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} />
                  <textarea className="input min-h-16" maxLength={320} value={s.body} aria-label="Текст" onChange={(e) => setPlan({ ...plan, slides: plan.slides.map((x, k) => (k === i ? { ...x, body: e.target.value } : x)) })} />
                  <label className="label !mb-0 flex items-center gap-1"><ImageIcon size={12} />Что нарисуем (для художника)</label>
                  <textarea className="input min-h-20 text-xs" maxLength={600} value={s.visual} onChange={(e) => setPlan({ ...plan, slides: plan.slides.map((x, k) => (k === i ? { ...x, visual: e.target.value } : x)) })} />
                </div>))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-ghost" onClick={() => { setPhase("compose"); setPlan(null); }}><ArrowLeft size={15} />Изменить запрос</button>
              <button type="button" className="btn btn-accent" disabled={short || noModel} onClick={() => run(plan.slides.map((_, i) => i))}><Sparkles size={15} />Создать {plan.slides.length} {plan.slides.length < 5 ? "слайда" : "слайдов"} · {unlimited ? "бесплатно" : rub(total)}</button>
              {short && <span className="text-sm text-bad">Не хватает {rub(total - balanceKop)}. <Link href="/app/billing" className="underline">Пополнить</Link></span>}
            </div>
          </div>
        )}

        {phase === "making" && plan && (
          <div className="space-y-4">
            <div className={`grid gap-3 ${S.format === "portrait" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
              {plan.slides.map((s, i) => { const x = sl[i] ?? { status: "wait" as const }; return (
                <div key={i} className={`group relative overflow-hidden rounded-2xl border border-line bg-surface ${aspect}`}>
                  <span className="absolute left-2 top-2 z-10 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">{i + 1}</span>
                  {x.status === "ok" && x.finalId && <img key={x.finalId} src={img(x.finalId)} alt={`Слайд ${i + 1}: ${s.title}`} className="slide-in size-full object-cover" />}
                  {x.status === "run" && <GenOrb startedAt={x.startedAt ?? Date.now()} />}
                  {x.status === "wait" && <div className="grid size-full place-items-center text-xs text-ink3">{running ? "В очереди" : "Ждёт запуска"}</div>}
                  {x.status === "err" && <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center"><p className="text-xs text-bad">{x.error}</p><button type="button" className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={() => void one(i)}><RefreshCw size={12} />Повторить · {rub(per)}</button></div>}
                  {x.status === "ok" && x.finalId && (
                    <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <a href={img(x.finalId, true)} className="rounded-lg bg-white/90 p-1.5 text-black" title="Скачать слайд" aria-label="Скачать слайд"><Download size={15} /></a>
                      <button type="button" className="rounded-lg bg-white/90 p-1.5 text-black" title="Изменить текст (бесплатно)" aria-label="Изменить текст" onClick={() => setEdit(i)}><Type size={15} /></button>
                      <button type="button" className="rounded-lg bg-white/90 p-1.5 text-black disabled:opacity-50" disabled={running} title={`Нарисовать картинку заново · ${rub(per)}`} aria-label="Перегенерировать" onClick={() => { setSaved(null); void run([i]); }}><RefreshCw size={15} /></button>
                    </div>)}
                </div>); })}
            </div>

            {allOk && !running && (
              <div className="card space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {saved ? <>
                    <span className="inline-flex items-center gap-1.5 text-sm text-good"><Check size={16} />Сохранено в материалы завода</span>
                    <Link href={`/app/factories/${saved.factoryId}?tab=create&draft=${saved.id}`} className="btn btn-accent">Открыть и опубликовать</Link>
                    <a href={`/api/export/${saved.id}/carousel`} className="btn btn-ghost"><Download size={15} />Скачать архив</a>
                  </> : <button type="button" className="btn btn-accent" disabled={busy !== ""} onClick={saveWork}>{busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Сохранить в материалы</button>}
                  <button type="button" className="btn btn-ghost" onClick={() => setPresetName("")}><Bookmark size={15} />Сохранить как пресет</button>
                  <button type="button" className="btn btn-ghost" onClick={reset}><Plus size={15} />Новая карусель</button>
                </div>
                {hasLogo && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
                    <span className="text-ink2">Логотип:</span>
                    <button type="button" className={`rounded-full px-3 py-1 ${S.logo ? "bg-accent text-white" : "bg-tile"}`} onClick={() => set({ logo: !S.logo })}>{S.logo ? "включён" : "выключен"}</button>
                    {S.logo && <select className="input !w-auto !py-1 text-sm" value={S.logoPos} onChange={(e) => set({ logoPos: e.target.value as StudioSettings["logoPos"] })} aria-label="Положение логотипа">{POS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
                    <button type="button" className="btn btn-ghost !py-1.5" disabled={busy !== ""} onClick={applyLogoAll}>{busy === "logo" && <Loader2 size={14} className="animate-spin" />}Применить ко всем (бесплатно)</button>
                  </div>)}
              </div>)}
            {!running && !allOk && <div className="flex gap-2"><button type="button" className="btn btn-ghost" onClick={() => setPhase("plan")}><ArrowLeft size={15} />К плану</button></div>}
          </div>
        )}
      </div>

      {err && <p className="mt-3 rounded-xl bg-bad-soft px-4 py-2.5 text-sm text-bad" role="alert">{err}</p>}

      {/* нижняя панель: запрос и параметры */}
      {(phase === "compose" || phase === "planning") && (
        <div className="sticky bottom-3 z-20 mt-4 rounded-3xl border border-line bg-surface p-3 shadow-xl">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-ink2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 font-medium text-accent-ink">{unlimited ? "Безлимит" : `${rub(per)}/слайд · ${count} сл. = ${rub(total)}`}</span>
            {short && <span className="text-bad">Не хватает {rub(total - balanceKop)} · <Link href="/app/billing" className="underline">пополнить</Link></span>}
          </div>
          <textarea className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-ink3" rows={3} maxLength={2000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Опишите тему или вставьте ссылку на новость. Например: «5 ошибок при выборе подрядчика»"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void makePlan(); }} aria-label="Запрос" />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Pop trigger={<><Sparkles size={13} className="text-accent" />{model?.label ?? "Нет моделей"} · {model ? rub(per) : ""}</>} wide>
              {(close) => <><p className="px-3 pb-1 pt-1 text-sm font-semibold">Модель отрисовки</p><p className="px-3 pb-2 text-xs text-ink3">Чем рисуем картинки слайдов. Цена за слайд с учётом качества.</p>
                {models.map((m) => <Opt key={m.id} on={m.id === S.model} onClick={() => { set({ model: m.id }); close(); }} title={m.label} price={`${rub(slidePrice(m, S.quality))}/слайд`} hint={m.hint} />)}</>}
            </Pop>
            <Pop trigger={<><Layers size={13} />{S.n} сл.</>}>
              {(close) => <><p className="px-3 pb-2 pt-1 text-sm font-semibold">Сколько слайдов</p>{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <Opt key={n} on={S.n === n} onClick={() => { set({ n }); close(); }} title={`${n} слайдов`} price={rub(per * n)} />)}</>}
            </Pop>
            <Pop trigger={<><ImageIcon size={13} />{QUALITY[S.quality].label}</>}>
              {(close) => <><p className="px-3 pb-1 pt-1 text-sm font-semibold">Качество</p><p className="px-3 pb-2 text-xs text-ink3">Размер готового слайда. Для лент хватает 1K.</p>
                {(Object.keys(QUALITY) as QualityKey[]).map((k) => <Opt key={k} on={S.quality === k} onClick={() => { set({ quality: k }); close(); }} title={QUALITY[k].label} price={model ? rub(slidePrice(model, k)) : ""} hint={`${QUALITY[k].hint} · ${QUALITY[k].width} px`} />)}</>}
            </Pop>
            <Pop trigger={<>{FORMATS[S.format].label}</>}>
              {(close) => <>{(Object.keys(FORMATS) as FormatKey[]).map((k) => <Opt key={k} on={S.format === k} onClick={() => { set({ format: k }); close(); }} title={FORMATS[k].label} />)}</>}
            </Pop>
            <Pop trigger={<><Type size={13} />{S.textInImage && model?.text ? "Текст рисует ИИ" : "Текст нашим шрифтом"}</>} wide>
              {(close) => <><Opt on={!S.textInImage} onClick={() => { set({ textInImage: false }); close(); }} title="Нашим шрифтом" hint="Ровная кириллица и фирменный шрифт бренда. Рекомендуем." />
                <Opt on={S.textInImage && !!model?.text} onClick={() => { if (model?.text) { set({ textInImage: true }); close(); } }} title="Рисует нейросеть" hint={model?.text ? "Красивее вписан в картинку, но возможны ошибки в буквах." : "Эта модель плохо рисует текст, выберите другую."} /></>}
            </Pop>
            {S.style && <span className="rounded-full bg-good-soft px-2.5 py-1 text-[11px] text-good">стиль пресета закреплён <button type="button" className="ml-1 underline" onClick={() => set({ style: "" })}>сбросить</button></span>}
            <button type="button" className="btn btn-accent ml-auto !h-10 !w-10 !justify-center !p-0" disabled={phase === "planning" || noModel || !prompt.trim()} onClick={makePlan} aria-label="Составить план" title="Составить план (Ctrl+Enter)">
              {phase === "planning" ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
            </button>
          </div>
          {noModel && <p className="mt-2 px-1 text-xs text-bad">Модель изображений не настроена. Администратору: «Настройки ИИ».</p>}
        </div>
      )}

      {/* правка текста слайда */}
      {edit !== null && plan && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Текст слайда" onClick={() => setEdit(null)}>
          <form className="card w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const i = edit; setEdit(null); setBusy("edit"); setSaved(null); await recompose(i, { title: String(f.get("title")), body: String(f.get("body")) }); setBusy(""); }}>
            <b>Текст слайда {edit + 1}</b><p className="text-xs text-ink3">Картинка останется, текст набирается заново. Бесплатно.</p>
            <input name="title" className="input" maxLength={90} defaultValue={plan.slides[edit].title} required aria-label="Заголовок" />
            <textarea name="body" className="input min-h-24" maxLength={320} defaultValue={plan.slides[edit].body} aria-label="Текст" />
            <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Отмена</button><button className="btn btn-accent">Применить</button></div>
          </form>
        </div>)}

      {/* сохранение пресета */}
      {presetName !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Сохранить как пресет" onClick={() => setPresetName(null)}>
          <form className="card w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void savePreset(); }}>
            <b>Сохранить как пресет</b>
            <p className="text-sm text-ink2">Запомним стиль серии, структуру слайдов, модель и качество. Потом выберете пресет, напишете новую тему, а стиль останется.</p>
            <input className="input" autoFocus maxLength={60} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Название, например «Тёмный премиум»" aria-label="Название пресета" />
            <p className="text-xs text-good">Запомним вид по {sl.filter((x) => x.status === "ok").length} готовым слайдам: следующая карусель будет в этой же манере.</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setPresetName(null)}>Отмена</button><button className="btn btn-accent" disabled={busy === "preset" || presetName.trim().length < 2}>{busy === "preset" ? <Loader2 size={15} className="animate-spin" /> : <Bookmark size={15} />}Сохранить</button></div>
          </form>
        </div>)}
    </div>
  );
}
