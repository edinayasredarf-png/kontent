"use client";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUp, Bookmark, Check, Clock, Copy, Download, ImageIcon, Layers, Loader2, Paperclip, Plus, RefreshCw, Save, Send, Sparkles, Trash2, Type, Wand2, X } from "lucide-react";
import { FORMATS, QUALITY, NO_OPTS, TYPES, typeOf, slidePrice, type Brief, type CreateOpts, type ImgModel, type RefItem } from "@/lib/creator/consts";
import { POST_TYPES } from "@/lib/postsettings";
import type { MadeItem, StudioSettings } from "@/lib/creator/actions";
import type { PresetRow, RecentWork } from "@/lib/creator/data";
import { briefAction, createMaterialAction, deletePresetAction, describeRefAction, dropStudioAssetsAction, planCarouselAction, recomposeSlideAction, saveWorkAction, savePresetAction, saveTextPresetAction } from "@/lib/creator/actions";
import type { PlanSlide } from "@/lib/creator/plan";
import { CreatorSettings } from "./CreatorSettings";
import { GenOrb } from "./GenOrb";
import { ExamplesModal, type ExampleRef } from "./ExamplesModal";
import { Pop, img, rub } from "./ui";

export interface FactoryOpt { id: string; name: string; brandId: string; brand: string; audience: string; hasLogo: boolean }
type SlideState = { status: "wait" | "run" | "ok" | "err"; finalId?: string; bgId?: string; error?: string; startedAt?: number };
type Phase = "compose" | "briefing" | "brief" | "making";
type Plan = { slides: PlanSlide[]; caption: string; style: string };

const POS: [string, string][] = [["tl", "Сверху слева"], ["tr", "Сверху справа"], ["bl", "Снизу слева"], ["br", "Снизу справа"], ["bc", "Снизу по центру"], ["tc", "Сверху по центру"]];
const PRIMARY_TYPES = ["post", "seo", "carousel", "reels", "infographic"];
const ORDERED_TYPES = PRIMARY_TYPES.map(k => TYPES.find(t => t.kind === k)!);
const WORDS: Record<string, string[]> = {
  post: ["Читаю задачу…", "Подбираю цепляющий хук…", "Пишу текст в голосе бренда…", "Вычитываю и убираю воду…"],
  reels: ["Придумываю хук для первых секунд…", "Раскладываю ролик по кадрам…", "Пишу текст за кадром…", "Проверяю хронометраж…"],
  article: ["Собираю структуру статьи…", "Пишу разделы…", "Проверяю факты из запроса…", "Вычитываю текст…"],
  seo: ["Разбираю поисковый запрос…", "Собираю структуру под поиск…", "Пишу статью…", "Готовлю заголовки и описание…"],
};
const fallbackWords = ["Читаю задачу…", "Пишу материал в голосе бренда…", "Вычитываю текст…", "Почти готово…"];

export function CreateStudio({ factories, scoped = false, startFactory, startKind, models, textModels, presets: initPresets, examples, recent, kindPrices, balanceKop, unlimited, unlimitedModels = [], textDefaultModels = {} }: {
  scoped?: boolean; factories: FactoryOpt[]; startFactory: string; startKind: string; models: ImgModel[]; textModels: string[]; presets: PresetRow[]; examples: ExampleRef[]; recent: RecentWork[];
  kindPrices: Record<string, number>; balanceKop: number; unlimited: boolean; unlimitedModels?: string[]; textDefaultModels?: Record<string, string>;
}) {
  const router = useRouter();
  const [fid, setFid] = useState(startFactory);
  const fac = factories.find((f) => f.id === fid) ?? factories[0];
  const [kind, setKind] = useState(startKind);
  const [prompt, setPrompt] = useState("");
  const [opts, setOpts] = useState<CreateOpts>(NO_OPTS);
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [S, setS] = useState<StudioSettings>({ model: models[0]?.id ?? "", quality: "1k", format: "portrait", n: 5, textInImage: false, logo: !!fac?.hasLogo, logoPos: "br", style: "", structure: "" });
  const set = (p: Partial<StudioSettings>) => setS((x) => ({ ...x, ...p }));
  const [phase, setPhase] = useState<Phase>("compose");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [angle, setAngle] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sl, setSl] = useState<SlideState[]>([]);
  const [made, setMade] = useState<MadeItem | null>(null);
  const [textStart, setTextStart] = useState(0);
  const [err, setErr] = useState("");
  const [presets, setPresets] = useState(initPresets);
  const [presetName, setPresetName] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; factoryId: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [edit, setEdit] = useState<number | null>(null);
  const [gallery, setGallery] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const live = useRef({ plan, sl, S, fid });
  live.current = { plan, sl, S, fid };

  const isCar = kind === "carousel";
  const t = typeOf(kind);
  const model = models.find((m) => m.id === S.model) ?? models[0];
  const per = model && !unlimited && !unlimitedModels.includes(model.id) ? slidePrice(model, S.quality) : 0;
  const count = plan ? plan.slides.length : S.n;
  const operationFree = unlimited || unlimitedModels.includes(isCar ? S.model : (opts.textModel || textDefaultModels[kind] || ""));
  const total = operationFree ? 0 : isCar ? per * count : (kindPrices[kind] ?? 0);
  const short = !unlimited && total > balanceKop;
  const patch = (i: number, p: Partial<SlideState>) => setSl((a) => a.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const allOk = sl.length > 0 && sl.every((x) => x.status === "ok");
  const running = sl.some((x) => x.status === "run" || x.status === "wait");
  const hasLogo = !!fac?.hasLogo;
  const working = phase === "briefing" || (phase === "making" && (running || busy === "text"));
  const hasResult = (isCar && phase === "making" && allOk && !running) || (!isCar && !!made);
  const refVisual = refs.map((r) => r.visual).filter(Boolean).join("; ").slice(0, 500);
  const refText = refs.map((r) => r.text || r.visual).filter(Boolean).join("\n").slice(0, 900);
  const audienceName = opts.audience ? "другой аудитории" : `аудитории «${fac?.brand}»`;

  /* ───── сброс и смена параметров ───── */
  const dirty = () => (isCar && allOk && !saved) || (phase === "making" && running);
  const resetFlow = () => { setPhase("compose"); setPlan(null); setSl([]); setBrief(null); setMade(null); setSaved(null); setErr(""); setAngle(""); };
  const guard = () => !dirty() || window.confirm("Текущая карусель не сохранена и пропадёт. Продолжить?");
  const pickKind = (k: string) => { if (k === kind || working) return; if (!guard()) return; resetFlow(); setKind(k); setOpts(o => ({...o,requirements:""})); };
  const pickFactory = (id: string) => { setFid(id); const f = factories.find((x) => x.id === id); set({ logo: !!f?.hasLogo && S.logo }); };

  /* ───── референсы ───── */
  const addRef = (r: RefItem) => setRefs((a) => (a.some((x) => x.id === r.id) ? a : a.length >= 3 ? a : [...a, r]));
  const toggleRef = (r: RefItem) => setRefs((a) => (a.some((x) => x.id === r.id) ? a.filter((x) => x.id !== r.id) : a.length >= 3 ? a : [...a, r]));
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true); setErr("");
    const fd = new FormData(); fd.set("file", file);
    const r = await describeRefAction(fid, fd);
    setUploading(false);
    if (!r.ok) return setErr(r.error);
    addRef({ id: `up-${r.id}`, title: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40) || "Свой файл", thumb: img(r.id), visual: r.visual, text: "", origin: "upload" });
  }

  /* ───── шаг 1: саммари (и план слайдов для карусели) ───── */
  async function makeBrief() {
    setErr("");
    if (working) return;
    if (!fid) return setErr("Сначала создайте завод: из него берутся бренд, тон и аудитория");
    if (prompt.trim().length < (isCar ? 8 : 3)) return setErr(isCar ? "Опишите тему хотя бы одним предложением" : "Опишите тему хотя бы парой слов");
    if (!guard()) return;
    resetFlow(); setPhase("briefing");
    try {
      if (isCar) {
        const r = await planCarouselAction(fid, prompt, { ...S, style: refs.length ? refVisual : S.style, structure: refs.length ? refs.map((x) => x.text).filter(Boolean).join("; ") : S.structure }, opts);
        if (!r.ok) { setErr(r.error); return setPhase("compose"); }
        setPlan({ slides: r.plan.slides, caption: r.plan.caption, style: r.plan.style });
        setBrief(r.plan.brief); setAngle(r.plan.brief.angle);
        setSl(r.plan.slides.map(() => ({ status: "wait" })));
      } else {
        const r = await briefAction(fid, kind, prompt, opts, refText);
        if (!r.ok) { setErr(r.error); return setPhase("compose"); }
        setBrief(r.brief); setAngle(r.brief.angle);
      }
      setPhase("brief");
    } catch {
      setErr("Не удалось получить ответ сервера. Повторите создание.");
      setPhase("compose");
    }
  }

  /* ───── шаг 2а: слайды карусели ───── */
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
    } catch { patch(i, { status: "err", error: "Нет связи с сервером. Если токены списались, они вернутся сами; проверьте баланс и повторите" }); }
  }, []);

  async function run(idx: number[]) {
    setPhase("making"); setErr("");
    setSl((a) => a.map((x, k) => (idx.includes(k) ? { status: "wait" } : x)));
    const queue = [...idx];
    const worker = async () => { while (queue.length) await one(queue.shift()!); };
    await Promise.all([worker(), worker()]);
    router.refresh(); // обновляем баланс в шапке
  }

  /* ───── шаг 2б: текстовый материал ───── */
  async function makeText() {
    setErr(""); setPhase("making"); setBusy("text"); setTextStart(Date.now());
    try {
      const r = await createMaterialAction({ factoryId: fid, kind, prompt, angle, opts, refText });
      if (!r.ok) { setErr(r.error); return setPhase("brief"); }
      setMade(r); router.refresh();
    } catch {
      setErr("Связь с сервером прервалась. Проверьте черновики завода перед повторным созданием.");
      setPhase("brief");
    } finally {
      setBusy("");
    }
  }

  async function saveWork(go = false) {
    if (!plan) return;
    setBusy("save"); setErr("");
    const r = await saveWorkAction({ factoryId: fid, topic: prompt.slice(0, 140), caption: plan.caption, slides: plan.slides, finalIds: sl.map((x) => x.finalId!), bgIds: sl.map((x) => x.bgId!), style: plan.style, settings: S });
    setBusy("");
    if (!r.ok) return setErr(r.error);
    setSaved({ id: r.id, factoryId: r.factoryId }); router.refresh();
    if (go) router.push(openLink(r.id, r.factoryId));
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
    if (presetName === null) return;
    setBusy("preset"); setErr("");
    if (isCar) {
      if (!plan) return setBusy("");
      const structure = `${plan.slides.length} слайдов: обложка, ${plan.slides.length - 2} смысловых, призыв к действию`;
      const r = await savePresetAction(presetName, { ...S, structure }, plan.style, sl[0]?.finalId ?? null, fac?.brandId ?? null);
      setBusy("");
      if (!r.ok) return setErr(r.error);
      setPresets((p) => [{ id: r.id, name: presetName.trim(), kind: "carousel", settings: { ...S, structure, style: plan.style }, sample: sl[0]?.finalId ?? null, brand_id: fac?.brandId ?? null }, ...p]);
    } else {
      const r = await saveTextPresetAction(presetName, kind, opts, refText, fac?.brandId ?? null);
      setBusy("");
      if (!r.ok) return setErr(r.error);
      setPresets((p) => [{ id: r.id, name: presetName.trim(), kind, settings: { opts, refText } as PresetRow["settings"], sample: null, brand_id: fac?.brandId ?? null }, ...p]);
    }
    setPresetName(null);
  }

  function applyPreset(p: PresetRow) {
    if (working) return;
    if (p.kind !== kind) { if (!guard()) return; resetFlow(); setKind(p.kind); }
    if (p.kind === "carousel") { setS((x) => ({ ...x, ...p.settings, logo: hasLogo && p.settings.logo })); setRefs([]); }
    else {
      setOpts({ ...NO_OPTS, ...(p.settings.opts ?? {}) });
      setRefs(p.settings.refText ? [{ id: `pr-${p.id}`, title: p.name, visual: "", text: p.settings.refText, origin: "work" }] : []);
    }
  }

  const aspect = S.format === "portrait" ? "aspect-[4/5]" : "aspect-square";
  const noModel = isCar && !model;
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* буфер недоступен */ } };

  const picked = refs.map((r) => r.id);
  const openLink = (id: string, f: string) => scoped ? `/app/factories/${f}?tab=create&item=${id}` : `/app/create?factory=${f}&item=${id}`;

  return (
    <div className={`${scoped ? "factory-studio lg:!min-h-[min(72dvh,760px)] lg:!grid-cols-[minmax(0,1fr)_220px] xl:!grid-cols-[minmax(0,1fr)_255px]" : "creator-studio"} grid min-w-0 grid-cols-1 gap-y-5 px-4 py-5 md:px-6 lg:min-h-[calc(100dvh-86px)] lg:grid-cols-[minmax(0,1fr)_255px] lg:grid-rows-[auto_1fr_auto] lg:gap-x-5 lg:py-0 lg:pl-0 lg:pr-2.5`}>
      {/* шапка */}
      <div className="flex min-w-0 flex-wrap items-center gap-3 lg:col-start-1 lg:row-start-1 lg:pl-[clamp(24px,4.3vw,76px)] lg:pt-[clamp(32px,5.35vh,65px)]">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Wand2 size={20} className="text-accent" />Создание материала</h1>
        <div className="flex max-w-full flex-wrap items-center gap-2 sm:ml-auto">
          {scoped ? <span className="chip">{fac?.brand}</span> : <select className="input !w-auto max-w-full !py-1.5 text-xs" value={fid} onChange={(e) => pickFactory(e.target.value)} disabled={working} aria-label="Завод">
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.brand}</option>)}
          </select>}

        </div>
      </div>

      {/* холст */}
      <div className="min-w-0 self-stretch lg:col-start-1 lg:row-start-2 lg:px-5 2xl:pl-24">
        {phase === "compose" && (
          <div className="flex min-h-[160px] justify-center px-2 py-8 text-center lg:pt-[clamp(44px,10vh,124px)] lg:pb-0">
            <div className="max-w-[570px] text-balance">

              <p className="font-medium">{isCar ? "Опишите карусель: ИИ разобьёт тему на слайды и нарисует отдельную картинку к каждому" : `Опишите, какой материал нужен: ИИ напишет ${t.noun} в голосе вашего бренда`}</p>
              <p className="mt-1 text-sm leading-5 text-ink2">Выберите тип ниже, при желании укажите стиль, аудиторию и референс. Перед запуском вы увидите описание материала и цену. Можно вставить ссылку на новость: факты возьмём оттуда.</p>

            </div>
          </div>
        )}

        {phase === "briefing" && <div className="grid min-h-72 place-items-center rounded-3xl border border-line"><GenOrb startedAt={Date.now()} typical={20} label={isCar ? "Разбираю тему на слайды и придумываю картинки…" : "Продумываю, чем материал будет полезен…"} /></div>}

        {phase === "brief" && brief && (
          <div className="space-y-4">
            <BriefCard brief={brief} kindLabel={t.short} audience={opts.audience || fac?.audience || ""} own={!!opts.audience} brand={fac?.brand ?? ""} />
            {!isCar && (
              <div className="card p-4">
                <label className="label">Угол подачи (можно поправить)</label>
                <input className="input" maxLength={300} value={angle} onChange={(e) => setAngle(e.target.value)} />
              </div>)}

            {isCar && plan && (<>
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
            </>)}

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-ghost" onClick={resetFlow}><ArrowLeft size={15} />Изменить запрос</button>
              <button type="button" className="btn btn-accent" disabled={short || noModel} onClick={() => (isCar && plan ? run(plan.slides.map((_, i) => i)) : makeText())}>
                <Sparkles size={15} />{isCar && plan ? `Создать ${plan.slides.length} ${plan.slides.length < 5 ? "слайда" : "слайдов"}` : `Создать ${t.noun}`} · {operationFree ? "Безлимит модели" : rub(total)}</button>
              {short && <span className="text-sm text-bad">Не хватает {rub(total - balanceKop)}. <Link href="/app/billing" className="underline">Пополнить</Link></span>}
            </div>
          </div>
        )}

        {phase === "making" && isCar && plan && (
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
        )}
        {phase === "making" && isCar && !running && !allOk && <div className="mt-3 flex gap-2"><button type="button" className="btn btn-ghost" onClick={() => setPhase("brief")}><ArrowLeft size={15} />К плану</button></div>}

        {phase === "making" && !isCar && !made && <div className="grid min-h-72 place-items-center rounded-3xl border border-line"><GenOrb startedAt={textStart} typical={35} phrases={WORDS[kind] ?? fallbackWords} /></div>}

        {phase === "making" && !isCar && made && (
          <div className="card space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 text-sm text-good"><Check size={16} />{typeOf(made.kind).short} готов и сохранён в черновики завода</span></div>
            <h2 className="text-lg font-semibold">{made.title}</h2>
            {made.imageId && <img src={`/api/assets/${made.imageId}`} alt="Иллюстрация материала" className="max-h-80 rounded-2xl object-contain" />}
            {made.imageError && <p role="status" className="text-sm text-warn">Картинка: {made.imageError}</p>}
            <div className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-tile p-4 text-sm leading-6">{made.body.replace(/<[^>]+>/g, made.kind === "seo" || made.kind === "email" || made.kind === "guide" ? " " : "") || "Материал создан: откройте его, чтобы посмотреть."}</div>
            <div className="flex flex-wrap gap-2">
              <Link href={openLink(made.id, made.factoryId)} className="btn btn-accent"><ImageIcon size={15} />Редактировать материал</Link>
              <button type="button" className="btn btn-ghost" onClick={() => void copy(made.body.replace(/<[^>]+>/g, " "))}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Скопировано" : "Копировать текст"}</button>
            </div>
          </div>
        )}
        {err && <p className="mx-auto mt-3 max-w-[770px] rounded-xl bg-bad-soft px-4 py-2.5 text-sm text-bad" role="alert">{err}</p>}
      </div>

      {/* нижняя панель */}
      <div className="mx-auto w-full min-w-0 max-w-[770px] self-end space-y-4 lg:col-start-1 lg:row-start-3 lg:w-[calc(100%_-_2.5rem)] 2xl:translate-x-[38px] lg:pb-[clamp(28px,6.55vh,80px)]">
        {hasResult && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {isCar ? (saved
              ? <Link href={openLink(saved.id, saved.factoryId)} className="btn btn-accent"><Send size={15} />Опубликовать · {sl.length} сл.</Link>
              : <button type="button" className="btn btn-accent" disabled={busy !== ""} onClick={() => void saveWork(true)}>{busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Опубликовать · {sl.length} сл.</button>)
              : made && <Link href={openLink(made.id, made.factoryId)} className="btn btn-accent"><Send size={15} />Опубликовать</Link>}
            <button type="button" className="btn btn-ghost bg-surface" onClick={() => { resetFlow(); setPrompt(""); }}><Plus size={15} />Новая {isCar ? "карусель" : t.short.toLowerCase()}</button>
            {isCar && !saved && <button type="button" className="btn btn-ghost bg-surface" disabled={busy !== ""} onClick={() => void saveWork(false)}>{busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Сохранить</button>}
            {isCar && saved && <a href={`/api/export/${saved.id}/carousel`} className="btn btn-ghost bg-surface"><Download size={15} />Архив</a>}
            <button type="button" className="btn btn-ghost bg-surface" onClick={() => setPresetName("")}><Bookmark size={15} />Сохранить как пресет</button>
          </div>)}

        {isCar && hasResult && hasLogo && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-ink2">Логотип:</span>
            <button type="button" className={`rounded-full px-3 py-1 ${S.logo ? "bg-accent text-white" : "bg-tile"}`} onClick={() => set({ logo: !S.logo })}>{S.logo ? "включён" : "выключен"}</button>
            {S.logo && <select className="input !w-auto !py-1 text-sm" value={S.logoPos} onChange={(e) => set({ logoPos: e.target.value as StudioSettings["logoPos"] })} aria-label="Положение логотипа">{POS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
            <button type="button" className="btn btn-ghost bg-surface !py-1.5" disabled={busy !== ""} onClick={applyLogoAll}>{busy === "logo" && <Loader2 size={14} className="animate-spin" />}Применить ко всем (бесплатно)</button>
          </div>)}

        {/* тип материала + цена */}
        <div className="flex min-w-0 justify-center">
          <div role="tablist" aria-label="Тип материала" className="flex max-w-full items-center gap-1 rounded-[14px] bg-tile p-1">
            <div className="flex min-w-0 gap-1 overflow-x-auto">{ORDERED_TYPES.map((x) => (
              <button key={x.kind} type="button" role="tab" aria-selected={x.kind === kind} disabled={working} onClick={() => pickKind(x.kind)} title={x.what}
                className={`shrink-0 whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm transition disabled:opacity-60 ${x.kind === kind ? "bg-accent font-medium text-white" : "text-ink2 hover:bg-tile2"}`}>{x.short}</button>))}
            </div><Pop label="Другие форматы" trigger={PRIMARY_TYPES.includes(kind) ? "Ещё" : t.short} className="!rounded-md !py-1.5">
              {(close) => TYPES.filter(x => !PRIMARY_TYPES.includes(x.kind)).map(x => <button type="button" key={x.kind} disabled={working} aria-pressed={kind === x.kind} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${kind === x.kind ? "bg-accent-soft text-accent" : "hover:bg-tile"}`} onClick={() => {pickKind(x.kind);close();}}>{x.short}<span className="mt-0.5 block text-[11px] text-ink3">{x.what}</span></button>)}
            </Pop>
          </div>

        </div>

        {/* ввод */}
        <div className="rounded-[20px] border border-accent bg-surface focus-within:ring-2 focus-within:ring-accent/10">
          {(refs.length > 0 || uploading) && (
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
              {refs.map((r) => (
                <span key={r.id} className="relative inline-flex items-center gap-2 rounded-xl bg-tile py-1 pl-1 pr-3 text-xs text-ink2" title={r.visual || r.text}>
                  <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg" style={r.thumb ? undefined : { background: `linear-gradient(155deg, ${(examples.find((e) => e.id === r.id)?.grad ?? ["#52525b", "#18181b"])[0]}, ${(examples.find((e) => e.id === r.id)?.grad ?? ["#52525b", "#18181b"])[1]})` }}>
                    {r.thumb ? <img src={r.thumb} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : <Layers size={14} className="text-white/80" />}</span>
                  <span className="max-w-[9rem] truncate">{r.title}</span>
                  <button type="button" aria-label={`Убрать референс «${r.title}»`} onClick={() => setRefs((a) => a.filter((x) => x.id !== r.id))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-bg"><X size={11} /></button>
                </span>))}
              {uploading && <span className="inline-flex items-center gap-2 rounded-xl bg-tile px-3 py-2 text-xs text-ink2"><Loader2 size={13} className="animate-spin" />Смотрю на картинку…</span>}
              <span className="text-[11px] text-ink3">референсы: стиль и подача будут как у них, тема ваша</span>
            </div>)}
          <textarea className="block w-full resize-none bg-transparent px-5 pt-4 text-xs outline-none placeholder:text-ink3" rows={2} maxLength={isCar ? 2000 : 20000} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={working}
            placeholder={isCar ? "Опишите тему или вставьте ссылку на новость. Например: «5 ошибок при выборе подрядчика»" : `О чём ${t.noun}? Тема, идея, ссылка или готовый текст`}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void makeBrief(); }} aria-label="Запрос" />
          <div className="px-4 pb-1 text-right text-[10px] tabular-nums text-ink3">{prompt.length} / {isCar ? 2000 : 20000}</div>
          <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-b-[19px] bg-tile px-3 py-2">
            <Pop chevron={false} label="Приложить референс" trigger={uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={15} />} className="!size-7 !justify-center !rounded-md !p-0">
              {(close) => <>
                <p className="px-3 pb-1 pt-1 text-sm font-semibold">Приложить референс</p>
                <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-tile" onClick={() => { close(); setGallery(true); }}><Layers size={15} className="text-accent" />Из примеров</button>
                <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-tile" onClick={() => { close(); fileRef.current?.click(); }}><Paperclip size={15} className="text-accent" />Файл с компьютера</button>
                <p className="px-3 pb-1 pt-2 text-xs font-medium text-ink3">Ранее созданное</p>
                {recent.length === 0 ? <p className="px-3 pb-2 text-xs text-ink3">Пока ничего нет: созданные материалы появятся здесь.</p> : recent.map((w) => (
                  <button key={w.id} type="button" className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-tile" onClick={() => { addRef(w); close(); }}>
                    {w.thumb ? <img src={w.thumb} alt="" className="size-9 shrink-0 rounded-lg object-cover" /> : <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-tile2 text-[10px] text-ink3">{typeOf(w.kind).short.slice(0, 4)}</span>}
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm">{w.title}</span><span className="block text-[11px] text-ink3">{typeOf(w.kind).short}</span></span>
                  </button>))}
              </>}
            </Pop>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
            {isCar && <>
              <select aria-label="Пропорции слайда" disabled={working || phase !== "compose"} value={S.format} onChange={e => set({ format: e.target.value as StudioSettings["format"] })} className="h-7 rounded-md bg-surface px-1 text-xs">{Object.entries(FORMATS).map(([key, format]) => <option key={key} value={key}>{format.label.split(" ")[0]}</option>)}</select>
              <select aria-label="Качество слайда" disabled={working || phase !== "compose"} value={S.quality} onChange={e => set({ quality: e.target.value as StudioSettings["quality"] })} className="h-7 rounded-md bg-surface px-1 text-xs">{Object.entries(QUALITY).map(([key, quality]) => <option key={key} value={key}>{quality.label}</option>)}</select>
              <select aria-label="Количество слайдов" disabled={working || phase !== "compose"} value={S.n} onChange={e => set({ n: Number(e.target.value) })} className="h-7 rounded-md bg-surface px-1 text-xs">{Array.from({ length: 8 }, (_, i) => i + 3).map(n => <option key={n} value={n}>{n} сл.</option>)}</select>
            </>}
            <button type="button" onClick={() => setGallery(true)} className="grid size-7 place-items-center rounded-md bg-surface text-ink hover:bg-accent-soft" aria-label="Примеры материалов" title="Примеры материалов"><Sparkles size={14} /></button>
            <Pop chevron={false} trigger={<Bookmark size={14} />} wide label="Пресеты" className="!size-7 !justify-center !rounded-md !p-0">
              {(close) => presets.length === 0 ? <p className="p-3 text-xs text-ink3">Пресетов пока нет. Создайте материал и нажмите «Сохранить как пресет»: стиль, тон, аудитория и (для каруселей) модель с качеством запомнятся.</p> : presets.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-tile">
                  {p.sample ? <img src={img(p.sample)} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-tile2 text-[10px] text-ink3">{typeOf(p.kind).short.slice(0, 4)}</span>}
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { applyPreset(p); close(); }}>
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-[11px] text-ink3">{p.kind === "carousel" ? `Карусель · ${models.find((m) => m.id === p.settings.model)?.label ?? "модель недоступна"} · ${QUALITY[p.settings.quality]?.label ?? ""} · ${p.settings.n} сл.` : `${typeOf(p.kind).short}${p.settings.opts?.postType ? ` · ${POST_TYPES[p.settings.opts.postType] ?? ""}` : ""}`}</span>
                  </button>
                  <button type="button" aria-label="Удалить пресет" className="rounded-lg p-1.5 text-ink3 hover:text-bad" onClick={() => { void deletePresetAction(p.id); setPresets((a) => a.filter((x) => x.id !== p.id)); }}><Trash2 size={14} /></button>
                </div>))}
            </Pop>
            <Pop chevron={false} trigger={<Clock size={14} />} wide label="Недавние материалы" className="!size-7 !justify-center !rounded-md !p-0">
              {(close) => <><p className="px-3 pb-1 pt-1 text-sm font-semibold">Недавние материалы</p>
                {recent.length === 0 ? <p className="px-3 pb-2 text-xs text-ink3">Пока ничего нет.</p> : recent.map((w) => (
                  <Link key={w.id} href={scoped ? `/app/factories/${fid}?tab=create&item=${w.id.slice(2)}` : `/app/create?item=${w.id.slice(2)}`} onClick={close} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-tile">
                    {w.thumb ? <img src={w.thumb} alt="" className="size-9 shrink-0 rounded-lg object-cover" /> : <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-tile2 text-[10px] text-ink3">{typeOf(w.kind).short.slice(0, 4)}</span>}
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm">{w.title}</span><span className="block text-[11px] text-ink3">{typeOf(w.kind).short} · {new Date(w.at).toLocaleDateString("ru-RU")}</span></span>
                  </Link>))}</>}
            </Pop>
            <span className="ml-auto" />
            {short && <span className="hidden text-xs text-bad sm:inline">Не хватает {rub(total - balanceKop)} · <Link href="/app/billing" className="underline">пополнить</Link></span>}
            <button type="button" className="btn btn-accent !h-8 !justify-center !rounded-md !px-2.5 !py-0" disabled={working || noModel || prompt.trim().length < 3} onClick={() => void makeBrief()} aria-label="Составить описание материала" title="Составить описание (Ctrl+Enter)">
              {phase === "briefing" ? <Loader2 size={16} className="animate-spin" /> : <><span className="text-[11px]">{operationFree ? "Безлимит модели" : rub(total)}</span><ArrowUp size={16} /></>}
            </button>
          </div>
        </div>
          {noModel && <p className="px-1 text-xs text-bad">Модель изображений не настроена. Администратору: «Настройки ИИ».</p>}
      </div>

      <CreatorSettings unlimitedModels={unlimitedModels} kind={kind} models={models} textModels={textModels} defaultTextModel={textDefaultModels[kind]} settings={S} opts={opts} audience={fac?.audience ?? ""} hasLogo={hasLogo} disabled={working || phase !== "compose"} set={set} setOpts={setOpts}/>

      {gallery && <ExamplesModal examples={examples} kind={kind} picked={picked} onToggle={toggleRef} onClose={() => setGallery(false)} />}

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
            <p className="text-sm text-ink2">{isCar ? "Запомним стиль серии, структуру слайдов, модель и качество. Потом выберете пресет, напишете новую тему, а стиль останется." : `Запомним тип «${t.short}», стиль, манеру, аудиторию и референс подачи. Потом выберете пресет и напишете новую тему.`}</p>
            <input className="input" autoFocus maxLength={60} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Название, например «Тёмный премиум»" aria-label="Название пресета" />
            {isCar && <p className="text-xs text-good">Запомним вид по {sl.filter((x) => x.status === "ok").length} готовым слайдам: следующая карусель будет в этой же манере.</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setPresetName(null)}>Отмена</button><button className="btn btn-accent" disabled={busy === "preset" || presetName.trim().length < 2}>{busy === "preset" ? <Loader2 size={15} className="animate-spin" /> : <Bookmark size={15} />}Сохранить</button></div>
          </form>
        </div>)}
    </div>
  );
}

/** Карточка «саммари»: что получится, чем хорош формат и чем материал полезен аудитории. */
function BriefCard({ brief, kindLabel, audience, own, brand }: { brief: Brief; kindLabel: string; audience: string; own: boolean; brand: string }) {
  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-ink"><Sparkles size={12} />Что получится</span>
        {brief.angle && <b className="text-base">{brief.angle}</b>}
      </div>
      <p className="text-sm leading-6">{brief.summary}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-tile p-4"><span className="label">Чем хорош формат «{kindLabel}»</span><p className="text-sm leading-6">{brief.whyFormat}</p></div>
        <div className="rounded-2xl bg-tile p-4"><span className="label">Чем хорош для {own ? "выбранной аудитории" : `аудитории «${brand}»`}</span><p className="text-sm leading-6">{brief.whyAudience}</p>
          {audience && <p className="mt-2 line-clamp-2 text-[11px] text-ink3">{own ? "Другая аудитория: " : "Аудитория бренда: "}{audience}</p>}</div>
      </div>
      {brief.outline.length > 0 && (
        <div><span className="label">Структура</span>
          <ol className="grid gap-1 text-sm text-ink2 sm:grid-cols-2">{brief.outline.map((o, i) => <li key={i} className="flex gap-2"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-tile text-[11px] text-ink3">{i + 1}</span>{o}</li>)}</ol></div>)}
      <p className="text-xs text-ink3">Другая аудитория или стиль? Поменяйте их в панели ниже и нажмите стрелку: описание составится заново. Это бесплатно.</p>
    </div>
  );
}
