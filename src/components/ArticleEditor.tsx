"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, Download, FileText, ImagePlus, Loader2 } from "lucide-react";
import { LeadMagnetPanel } from "./LeadMagnetPanel";
import type { LeadMeta } from "@/lib/lead-magnet";
import { AiTextTools } from "./AiTextTools";
import { CopyText } from "./CopyText";
import { h2Titles, htmlToPlain, safePreviewHtml } from "@/lib/html-text";
import { sectionImageAction } from "@/lib/article-actions";
import { SECTION_ASPECTS } from "@/lib/article-lib";

const TABS = [["site", "Как на сайте"], ["plain", "Текст без тегов"], ["html", "HTML"]] as const;
type Tab = (typeof TABS)[number][0];

/**
 * Статья для сайта (SEO, рассылка, гайд): предпросмотр «как на сайте», чистый текст без тегов (его можно скопировать), исходный HTML.
 * Для SEO-статьи и гайда ниже — подбор картинок к разделам: сначала вы выбираете разделы, пожелания и формат, и только потом идёт генерация.
 */
export function ArticleEditor({ itemId, kind, initial, seo, title, imagePrice, imagePriceKop, free, lead = null, brandName = "", editPrice = "" }: { itemId: string; kind: string; initial: string; seo: { title?: string; description?: string; slug?: string } | null; title: string; imagePrice: string; imagePriceKop: number; free: boolean; lead?: LeadMeta | null; brandName?: string; editPrice?: string }) {
  const [html, setHtml] = useState(initial);
  const [tab, setTab] = useState<Tab>("site");
  const plain = useMemo(() => (typeof window === "undefined" ? "" : htmlToPlain(html)), [html]);
  const preview = useMemo(() => (typeof window === "undefined" ? "" : safePreviewHtml(html)), [html]);
  const heading = seo?.title || title;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`chip cursor-pointer !px-3 !py-1 text-xs ${tab === k ? "bg-accent-soft text-accent-ink" : ""}`}>{l}</button>)}
        <span className="ml-auto flex flex-wrap items-center gap-2"><CopyText text={plain} label="Копировать текст" /><CopyText text={html} label="Копировать HTML" /></span>
      </div>

      {tab === "site" && (
        <div className="space-y-3">
          {kind === "seo" && seo && (seo.title || seo.description) && (
            <div className="rounded-xl bg-white p-3 text-[#1c1f23] shadow-sm">
              <div className="mb-0.5 text-[11px] text-[#5f6b7a]">Так статья может выглядеть в поиске</div>
              <div className="truncate text-[11px] text-[#5f6b7a]">https://ваш-сайт.ru/{seo.slug ?? "statya"}</div>
              <div className="text-[17px] leading-snug text-[#1a0dab]">{(seo.title ?? "").slice(0, 65)}{(seo.title ?? "").length > 65 ? "…" : ""}</div>
              <div className="text-[13px] leading-snug text-[#4d5156]">{(seo.description ?? "").slice(0, 165)}{(seo.description ?? "").length > 165 ? "…" : ""}</div>
            </div>
          )}
          <article className="mx-auto max-w-2xl rounded-xl bg-white p-5 text-[#1c1f23] shadow-sm sm:p-8">
            <h1 className="mb-4 font-serif text-[26px] font-bold leading-tight">{heading}</h1>
            <div className="font-serif text-[15.5px] leading-7 [&_a]:text-[#2b7de9] [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-[#d0d5dd] [&_blockquote]:pl-4 [&_blockquote]:italic [&_figure]:my-5 [&_h2]:mb-2 [&_h2]:mt-7 [&_h2]:text-[21px] [&_h2]:font-bold [&_h2]:leading-snug [&_h3]:mb-1.5 [&_h3]:mt-5 [&_h3]:text-[17px] [&_h3]:font-bold [&_img]:h-auto [&_img]:w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#d0d5dd] [&_td]:p-2 [&_th]:border [&_th]:border-[#d0d5dd] [&_th]:bg-[#f3f4f6] [&_th]:p-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
              dangerouslySetInnerHTML={{ __html: preview }} />
          </article>
        </div>
      )}
      {tab === "plain" && <textarea readOnly value={plain} rows={14} className="input !rounded-2xl !bg-surface text-sm leading-6" aria-label="Текст без тегов" />}
      {/* поле HTML всегда в форме: сохраняется то, что в нём; на других вкладках оно скрыто */}
      <div hidden={tab !== "html"} className="space-y-2">
        <textarea name="body" value={html} onChange={(e) => setHtml(e.target.value)} rows={14} spellCheck={false} className="input !rounded-2xl !bg-surface font-mono text-xs leading-5" aria-label="HTML статьи" />
        <p className="text-xs text-ink3">Разрешены заголовки H2–H4, абзацы, списки, ссылки, таблицы, картинки. Остальное при сохранении убирается.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-tile p-3 text-xs text-ink2">
        <b className="flex items-center gap-1.5 text-sm"><FileText size={15} />Скачать документ</b>
        <a href={`/api/export/${itemId}/file?format=docx`} className="btn btn-ghost !py-1.5"><Download size={14} />Word (.docx)</a>
        <a href={`/api/export/${itemId}/file?format=pdf`} className="btn btn-ghost !py-1.5"><Download size={14} />PDF</a>
        <span className="text-ink3">Берётся последний сохранённый текст: если правили, сначала нажмите «Сохранить текст».</span>
      </div>
      <AiTextTools getText={() => html} setText={setHtml} price={free ? "" : "3 ₽"} />
      {kind === "guide" && <LeadMagnetPanel itemId={itemId} initial={lead} brandName={brandName} price={editPrice} />}
      {(kind === "seo" || kind === "guide") && <SectionImages itemId={itemId} html={html} setHtml={setHtml} priceLabel={imagePrice} priceKop={imagePriceKop} free={free} />}
    </div>
  );
}

/** Подбор картинок к разделам: что, где и в каком формате делаем, и только потом генерация (по одной, с прогрессом). */
function SectionImages({ itemId, html, setHtml, priceLabel, priceKop, free }: { itemId: string; html: string; setHtml: (h: string) => void; priceLabel: string; priceKop: number; free: boolean }) {
  const heads = useMemo(() => (typeof window === "undefined" ? [] : h2Titles(html)), [html]);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [wish, setWish] = useState<Record<number, string>>({});
  const [aspect, setAspect] = useState<keyof typeof SECTION_ASPECTS>("landscape");
  const [ask, setAsk] = useState(false);
  const [run, setRun] = useState<{ done: number; total: number; cur: string } | null>(null);
  const [res, setRes] = useState<Record<number, "ok" | string>>({});
  const toggle = (i: number) => setPick((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const hasImage = (i: number) => { const d = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html"); const h = d.querySelectorAll("h2")[i]; return h?.nextElementSibling?.tagName === "FIGURE"; };
  const count = pick.size, total = priceKop * count;
  const rub = (kop: number) => `${(kop / 100).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;

  async function go() {
    setAsk(false);
    const list = [...pick].sort((a, b) => a - b);
    let cur = html;
    for (let n = 0; n < list.length; n++) {
      const i = list[n];
      setRun({ done: n, total: list.length, cur: heads[i] });
      const r = await sectionImageAction(itemId, cur, i, wish[i] ?? "", aspect).catch(() => null);
      if (!r?.ok) { setRes((x) => ({ ...x, [i]: r && !r.ok ? r.error : "Не удалось выполнить" })); break; }
      cur = r.html; setHtml(cur); setRes((x) => ({ ...x, [i]: "ok" }));
    }
    setRun(null); setPick(new Set());
  }
  if (!heads.length) return <p className="rounded-2xl bg-tile p-3 text-xs text-ink3">Картинки к разделам можно создать, когда в статье есть заголовки второго уровня (H2).</p>;
  return (
    <div className="space-y-3 rounded-2xl bg-tile p-3">
      <div className="flex flex-wrap items-center gap-2"><b className="flex items-center gap-1.5 text-sm"><ImagePlus size={15} />Картинки к разделам статьи</b><span className="text-xs text-ink3">Выберите разделы и пожелания, затем запустите создание. {free ? "" : `Одна картинка — ${priceLabel}.`}</span></div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-ink2">Быстрый выбор:</span>
        <button type="button" onClick={() => setPick(new Set(heads.map((_, i) => i)))} className="chip cursor-pointer !px-2.5 !py-0.5">Ко всем разделам</button>
        <button type="button" onClick={() => setPick(new Set(heads.slice(0, 3).map((_, i) => i)))} className="chip cursor-pointer !px-2.5 !py-0.5">К первым трём</button>
        <button type="button" onClick={() => setPick(new Set())} className="chip cursor-pointer !px-2.5 !py-0.5">Снять</button>
        <select value={aspect} onChange={(e) => setAspect(e.target.value as keyof typeof SECTION_ASPECTS)} aria-label="Формат картинок" className="input ml-auto !w-auto !py-1 text-xs">{Object.entries(SECTION_ASPECTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="space-y-1.5">
        {heads.map((h, i) => (
          <div key={i} className="rounded-xl bg-surface p-2.5">
            <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" checked={pick.has(i)} disabled={!!run} onChange={() => toggle(i)} className="mt-1" /><span className="min-w-0 flex-1"><b className="font-semibold">{h || `Раздел ${i + 1}`}</b>
              {hasImage(i) && <span className="ml-2 text-xs text-good">картинка есть (будет заменена)</span>}
              {res[i] === "ok" && <CheckCircle2 size={14} className="ml-1.5 inline text-good" />}</span></label>
            {pick.has(i) && <input value={wish[i] ?? ""} onChange={(e) => setWish((w) => ({ ...w, [i]: e.target.value }))} maxLength={300} disabled={!!run} placeholder="Что изобразить (необязательно): например «бригада осматривает дерево»" className="input mt-1.5 !bg-tile !py-1.5 text-xs" />}
            {res[i] && res[i] !== "ok" && <p className="mt-1 text-xs text-bad">{res[i]}</p>}
          </div>
        ))}
      </div>
      {run && <p className="flex items-center gap-2 text-xs text-ink2"><Loader2 size={13} className="animate-spin" />Создаём картинку {run.done + 1} из {run.total}: «{run.cur}»… Окно можно не закрывать, это занимает до минуты на картинку.</p>}
      {!run && !ask && <button type="button" onClick={() => setAsk(true)} disabled={count === 0} className="btn btn-accent !py-2"><ImagePlus size={15} />Создать картинки{count ? ` (${count})` : ""}{count && !free ? ` · ${rub(total)}` : ""}</button>}
      {ask && (
        <div className="space-y-2 rounded-xl bg-surface p-3 text-sm">
          <p>Будет создано картинок: <b>{count}</b>{free ? "" : <> на сумму <b>{rub(total)}</b></>}. Формат: {SECTION_ASPECTS[aspect].toLowerCase()}. Картинка встанет сразу после заголовка раздела, прежняя (если есть) заменится.</p>
          <div className="flex gap-2"><button type="button" onClick={go} className="btn btn-accent !py-1.5">Создать</button><button type="button" onClick={() => setAsk(false)} className="btn btn-ghost !py-1.5">Изменить выбор</button></div>
        </div>
      )}
      <p className="text-xs text-ink3">После создания проверьте статью во вкладке «Как на сайте» и нажмите «Сохранить текст» внизу, если правили HTML вручную. На сайт картинки уходят ссылками на наш сервер (нужен APP_URL), либо скачайте их из HTML.</p>
    </div>
  );
}
