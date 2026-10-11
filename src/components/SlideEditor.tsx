"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Bold, Circle, Copy, ImagePlus, Loader2, Redo2, Save, Square, Trash2, Type, Undo2, X } from "lucide-react";

type Kind = "text" | "rect" | "ellipse" | "image";
interface Layer { id: number; type: Kind; x: number; y: number; w: number; h: number; text?: string; size?: number; bold?: boolean; align?: "left" | "center" | "right"; color: string; opacity: number; src?: string; radius?: number }
export interface EditorTarget { key: string; label: string; assetId: string }

const MAX_H = 1350;
const imgCache = new Map<string, HTMLImageElement>();
function loadImg(src: string): Promise<HTMLImageElement> {
  const hit = imgCache.get(src);
  if (hit?.complete) return Promise.resolve(hit);
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => { imgCache.set(src, i); res(i); }; i.onerror = () => rej(new Error("Не удалось загрузить картинку")); i.src = src; });
}

/** Рисует весь холст: исходный слайд (если не скрыт) и слои по порядку. Текст переносится по словам внутри рамки слоя. */
function paint(ctx: CanvasRenderingContext2D, W: number, H: number, bg: HTMLImageElement | null, bgColor: string, layers: Layer[], family: string, selected: number | null, handles: boolean) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  for (const l of layers) {
    ctx.save(); ctx.globalAlpha = l.opacity;
    if (l.type === "rect") { ctx.fillStyle = l.color; ctx.beginPath(); ctx.roundRect(l.x, l.y, l.w, l.h, Math.min(l.radius ?? 0, l.w / 2, l.h / 2)); ctx.fill(); }
    else if (l.type === "ellipse") { ctx.fillStyle = l.color; ctx.beginPath(); ctx.ellipse(l.x + l.w / 2, l.y + l.h / 2, Math.abs(l.w / 2), Math.abs(l.h / 2), 0, 0, Math.PI * 2); ctx.fill(); }
    else if (l.type === "image" && l.src) { const im = imgCache.get(l.src); if (im) ctx.drawImage(im, l.x, l.y, l.w, l.h); }
    else if (l.type === "text") {
      const size = l.size ?? 64; ctx.fillStyle = l.color; ctx.font = `${l.bold ? 800 : 500} ${size}px ${family}`; ctx.textBaseline = "top";
      const lines: string[] = [];
      for (const para of (l.text ?? "").split("\n")) {
        let cur = "";
        for (const w of para.split(" ")) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width <= l.w || !cur) cur = t; else { lines.push(cur); cur = w; } }
        lines.push(cur);
      }
      const lh = size * 1.18;
      lines.forEach((ln, i) => { const tw = ctx.measureText(ln).width; const x = l.align === "center" ? l.x + (l.w - tw) / 2 : l.align === "right" ? l.x + l.w - tw : l.x; ctx.fillText(ln, x, l.y + i * lh); });
      l.h = Math.max(lines.length * lh, size * 1.2);
    }
    ctx.restore();
  }
  if (handles && selected != null) {
    const l = layers.find((x) => x.id === selected);
    if (l) { ctx.save(); ctx.strokeStyle = "#029cda"; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.strokeRect(l.x, l.y, l.w, l.h); ctx.setLineDash([]); ctx.fillStyle = "#029cda"; ctx.fillRect(l.x + l.w - 12, l.y + l.h - 12, 24, 24); ctx.restore(); }
  }
}

/**
 * Визуальный редактор слайда: поверх готового слайда добавляются текст, фигуры и свои картинки, всё двигается и меняется мышью или пальцем.
 * Результат рисуется на холсте в браузере и сохраняется как новая картинка слайда (JPEG).
 */
export function SlideEditor({ itemId, targets, colors }: { itemId: string; targets: EditorTarget[]; colors: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<EditorTarget | null>(null);
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink2">Визуальный редактор:</span>
        {targets.map((t) => <button key={t.key} type="button" onClick={() => setOpen(t)} className="btn btn-ghost !px-3 !py-1 text-xs">{t.label}</button>)}
      </div>
    );
  }
  return <Canvas key={open.key} itemId={itemId} target={open} colors={colors} onClose={(saved) => { setOpen(null); if (saved) router.refresh(); }} />;
}

function Canvas({ itemId, target, colors, onClose }: { itemId: string; target: EditorTarget; colors: string[]; onClose: (saved: boolean) => void }) {
  const cv = useRef<HTMLCanvasElement>(null), file = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ w: 1080, h: 1350 });
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [showBg, setShowBg] = useState(true);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [hist, setHist] = useState<{ past: Layer[][]; future: Layer[][] }>({ past: [], future: [] });
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const idc = useRef(1), drag = useRef<{ mode: "move" | "size"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; id: number; pushed: boolean } | null>(null);
  const [family, setFamily] = useState("Inter, system-ui, sans-serif");

  useEffect(() => { setFamily(getComputedStyle(document.body).fontFamily || "Inter, system-ui, sans-serif"); }, []);
  useEffect(() => { loadImg(`/api/assets/${target.assetId}`).then((im) => { setBg(im); setSize({ w: im.naturalWidth, h: im.naturalHeight }); }).catch(() => setMsg("Не удалось загрузить слайд")); }, [target.assetId]);
  useEffect(() => { const c = cv.current; if (c) { c.width = size.w; c.height = size.h; } }, [size]);
  useEffect(() => { const c = cv.current, ctx = c?.getContext("2d"); if (c && ctx) paint(ctx, size.w, size.h, showBg ? bg : null, bgColor, layers, family, sel, true); }, [layers, sel, bg, bgColor, showBg, size, family]);

  const commit = useCallback((next: Layer[], keepSel?: number | null) => { setHist((h) => ({ past: [...h.past.slice(-40), layers], future: [] })); setLayers(next); if (keepSel !== undefined) setSel(keepSel); }, [layers]);
  const undo = () => setHist((h) => { const p = h.past[h.past.length - 1]; if (!p) return h; setLayers(p); return { past: h.past.slice(0, -1), future: [layers, ...h.future] }; });
  const redo = () => setHist((h) => { const n = h.future[0]; if (!n) return h; setLayers(n); return { past: [...h.past, layers], future: h.future.slice(1) }; });
  const cur = layers.find((l) => l.id === sel) ?? null;
  const patch = (p: Partial<Layer>) => { if (cur) commit(layers.map((l) => (l.id === cur.id ? { ...l, ...p } : l))); };
  const add = (l: Omit<Layer, "id">) => { const id = idc.current++; commit([...layers, { ...l, id }], id); };

  const pt = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h }; };
  const down = (e: React.PointerEvent) => {
    const p = pt(e);
    const hit = [...layers].reverse().find((l) => p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h);
    const onHandle = cur && p.x >= cur.x + cur.w - 28 && p.x <= cur.x + cur.w + 14 && p.y >= cur.y + cur.h - 28 && p.y <= cur.y + cur.h + 14;
    const target = onHandle ? cur : hit;
    if (!target) { setSel(null); return; }
    setSel(target.id);
    drag.current = { mode: onHandle ? "size" : "move", sx: p.x, sy: p.y, ox: target.x, oy: target.y, ow: target.w, oh: target.h, id: target.id, pushed: false };
    cv.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const p = pt(e), dx = p.x - d.sx, dy = p.y - d.sy;
    if (!d.pushed && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) { setHist((h) => ({ past: [...h.past.slice(-40), layers], future: [] })); d.pushed = true; }
    setLayers((ls) => ls.map((l) => (l.id !== d.id ? l : d.mode === "move" ? { ...l, x: d.ox + dx, y: d.oy + dy } : { ...l, w: Math.max(40, d.ow + dx), h: l.type === "text" ? l.h : Math.max(40, d.oh + dy) })));
  };
  const up = () => { drag.current = null; };

  const addImage = async (f: File | undefined) => {
    if (!f) return;
    const src = URL.createObjectURL(f);
    try { const im = await loadImg(src); const k = Math.min(1, (size.w * 0.7) / im.naturalWidth, (size.h * 0.5) / im.naturalHeight); add({ type: "image", x: 80, y: 120, w: im.naturalWidth * k, h: im.naturalHeight * k, color: "#000", opacity: 1, src }); }
    catch { setMsg("Не удалось открыть картинку"); }
    if (file.current) file.current.value = "";
  };

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const out = document.createElement("canvas"); out.width = size.w; out.height = size.h;
      paint(out.getContext("2d")!, size.w, size.h, showBg ? bg : null, bgColor, layers, family, null, false);
      const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/jpeg", 0.9));
      if (!blob) throw new Error("Не удалось собрать картинку");
      const fd = new FormData(); fd.set("id", itemId); fd.set("target", target.key); fd.set("file", new File([blob], "slide.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/editor/save", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Ошибка ${res.status}`);
      onClose(true);
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  };

  const palette = [...colors, "#ffffff", "#14161a"];
  return (
    <div className="space-y-3 rounded-xl border border-accent/50 bg-surface p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <b className="mr-2 text-sm">Редактор: {target.label}</b>
        <button type="button" className="btn btn-ghost !px-2.5 !py-1.5" title="Текст" onClick={() => add({ type: "text", x: 90, y: size.h / 2 - 60, w: size.w - 180, h: 90, text: "Новый текст", size: 72, bold: true, align: "left", color: "#14161a", opacity: 1 })}><Type size={15} /></button>
        <button type="button" className="btn btn-ghost !px-2.5 !py-1.5" title="Прямоугольник" onClick={() => add({ type: "rect", x: 90, y: 200, w: 500, h: 220, color: palette[1] ?? "#ffffff", opacity: 1, radius: 40 })}><Square size={15} /></button>
        <button type="button" className="btn btn-ghost !px-2.5 !py-1.5" title="Круг" onClick={() => add({ type: "ellipse", x: 200, y: 300, w: 300, h: 300, color: palette[2] ?? palette[0] ?? "#ffffff", opacity: 1 })}><Circle size={15} /></button>
        <button type="button" className="btn btn-ghost !px-2.5 !py-1.5" title="Своя картинка" onClick={() => file.current?.click()}><ImagePlus size={15} /></button>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => addImage(e.target.files?.[0])} />
        <span className="mx-1 h-5 w-px bg-line" />
        <button type="button" className="btn btn-ghost !px-2.5 !py-1.5" title="Отменить" disabled={!hist.past.length} onClick={undo}><Undo2 size={15} /></button>
        <button type="button" className="btn btn-ghost !px-2.5 !py-1.5" title="Повторить" disabled={!hist.future.length} onClick={redo}><Redo2 size={15} /></button>
        <label className="ml-2 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={showBg} onChange={(e) => setShowBg(e.target.checked)} />Исходный слайд</label>
        {!showBg && <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" title="Цвет фона" />}
        <div className="ml-auto flex gap-1.5">
          <button type="button" className="btn btn-ghost !py-1.5" onClick={() => onClose(false)}><X size={14} />Закрыть</button>
          <button type="button" className="btn !py-1.5" onClick={save} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Сохранить слайд</button>
        </div>
      </div>
      {cur && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tile p-2 text-xs">
          <input type="color" value={cur.color} onChange={(e) => patch({ color: e.target.value })} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" title="Цвет" />
          {palette.slice(0, 8).map((c) => <button key={c} type="button" onClick={() => patch({ color: c })} className="size-5 rounded-full border border-line" style={{ background: c }} aria-label={c} />)}
          <label className="flex items-center gap-1">Прозрачность<input type="range" min={10} max={100} value={Math.round(cur.opacity * 100)} onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })} /></label>
          {cur.type === "text" && (<>
            <label className="flex items-center gap-1">Размер<input type="range" min={24} max={200} value={cur.size ?? 64} onChange={(e) => patch({ size: Number(e.target.value) })} /></label>
            <button type="button" className={`btn btn-ghost !px-2 !py-1 ${cur.bold ? "!bg-accent-soft" : ""}`} onClick={() => patch({ bold: !cur.bold })} title="Жирный"><Bold size={14} /></button>
            {(["left", "center", "right"] as const).map((a) => <button key={a} type="button" className={`btn btn-ghost !px-2 !py-1 ${cur.align === a ? "!bg-accent-soft" : ""}`} onClick={() => patch({ align: a })}>{a === "left" ? <AlignLeft size={14} /> : a === "center" ? <AlignCenter size={14} /> : <AlignRight size={14} />}</button>)}
          </>)}
          {cur.type === "rect" && <label className="flex items-center gap-1">Скругление<input type="range" min={0} max={200} value={cur.radius ?? 0} onChange={(e) => patch({ radius: Number(e.target.value) })} /></label>}
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" className="btn btn-ghost !px-2 !py-1" title="Дублировать" onClick={() => { const id = idc.current++; commit([...layers, { ...cur, id, x: cur.x + 30, y: cur.y + 30 }], id); }}><Copy size={14} /></button>
          <button type="button" className="btn btn-ghost !px-2 !py-1" title="На передний план" onClick={() => commit([...layers.filter((l) => l.id !== cur.id), cur])}><ArrowUpToLine size={14} /></button>
          <button type="button" className="btn btn-ghost !px-2 !py-1" title="На задний план" onClick={() => commit([cur, ...layers.filter((l) => l.id !== cur.id)])}><ArrowDownToLine size={14} /></button>
          <button type="button" className="btn btn-ghost !px-2 !py-1 !text-bad" title="Удалить" onClick={() => commit(layers.filter((l) => l.id !== cur.id), null)}><Trash2 size={14} /></button>
          {cur.type === "text" && <textarea value={cur.text} onChange={(e) => patch({ text: e.target.value })} rows={2} className="input !bg-surface mt-1 w-full text-sm" aria-label="Текст слоя" />}
        </div>
      )}
      <div className="overflow-auto rounded-lg bg-tile2 p-2">
        <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="mx-auto block touch-none rounded shadow" style={{ width: "min(100%, 520px)", height: "auto", aspectRatio: `${size.w} / ${Math.min(size.h, MAX_H)}`, cursor: "move" }} />
      </div>
      <p className="text-xs text-ink3">Нажмите на элемент, чтобы выбрать: тяните, чтобы двигать, за синий угол — менять размер. Результат заменит картинку этого слайда. Правка текста слайда в форме ниже такой слайд не затронет, пока вы не вернёте исходный.</p>
      {msg && <p className="text-xs text-bad">{msg}</p>}
    </div>
  );
}
