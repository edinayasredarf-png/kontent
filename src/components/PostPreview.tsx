"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toPlain } from "@/lib/publishing/format";

const NETS: { k: string; label: string }[] = [{ k: "telegram", label: "Telegram" }, { k: "vk", label: "ВКонтакте" }, { k: "max", label: "MAX" }];
const TG_CAPTION = 1024, TG_MSG = 4000, MAX_MSG = 3900, VK_FOLD = 360;

/** Хештеги и ссылки подсвечиваем, как в соцсетях. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+|#[\p{L}\p{N}_]+)/gu);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="text-[#2b7de9]">{p}</span> : p))}</>;
}

function Photos({ urls, rounded = "rounded-xl" }: { urls: string[]; rounded?: string }) {
  if (!urls.length) return null;
  const shown = urls.slice(0, 4);
  const grid = shown.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <div className={`grid ${grid} gap-0.5 overflow-hidden ${rounded}`}>
      {shown.map((u, i) => (
        <div key={i} className="relative bg-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className={`w-full object-cover ${shown.length === 1 ? "max-h-72" : "aspect-square"}`} />
          {i === 3 && urls.length > 4 && <span className="absolute inset-0 grid place-items-center bg-black/50 text-lg font-semibold text-white">+{urls.length - 4}</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * Предпросмотр: как текст и картинки выглядят в Telegram, ВКонтакте и MAX. Правила те же, что при публикации: подпись к фото в Telegram до 1024 знаков,
 * длинный текст делится на сообщения, в ВК длинный текст сворачивается. Это образец, а не точная копия: мессенджеры меняют оформление.
 */
export function PostPreview({ text, images, kinds, oneMessageTg, name }: { text: string; images: string[]; kinds: string[]; oneMessageTg: boolean; name: string }) {
  const nets = NETS.filter((n) => !kinds.length || kinds.includes(n.k));
  const list = nets.length ? nets : NETS;
  const [tab, setTab] = useState(list[0].k);
  const plain = toPlain(text);
  const n = plain.length;
  const warn: string[] = [];
  const tg = (() => {
    if (!images.length) return { photoOnly: false, caption: "", chunks: Math.max(1, Math.ceil(n / TG_MSG)) };
    if (images.length === 1 && n <= TG_CAPTION) return { photoOnly: false, caption: plain, chunks: 1 };
    if (images.length >= 2 && n <= TG_CAPTION) return { photoOnly: false, caption: plain, chunks: 1 };
    return { photoOnly: !oneMessageTg, caption: "", chunks: Math.max(1, Math.ceil(n / TG_MSG)) };
  })();
  if (tab === "telegram") {
    if (images.length && n > TG_CAPTION && !oneMessageTg) warn.push(`Текст длиннее ${TG_CAPTION} знаков: подпись к фото в Telegram не помещается, пост уйдёт двумя сообщениями (фото, затем текст). Одним сообщением выйдет, если на сервере задан APP_URL, или сократите текст.`);
    if (n > TG_MSG) warn.push(`Текст длиннее ${TG_MSG} знаков и уйдёт несколькими сообщениями (${tg.chunks}).`);
  }
  if (tab === "vk" && images.length) warn.push("Ключ сообщества VK не умеет прикреплять фото к записи на стене: картинка может выйти карточкой-ссылкой или не выйти совсем (подробнее в подсказке при подключении VK).");
  if (tab === "max") { if (n > MAX_MSG) warn.push(`Текст длиннее ${MAX_MSG} знаков и уйдёт несколькими сообщениями.`); if (images.length > 10) warn.push("В MAX уходит не более 10 картинок."); }
  const folded = tab === "vk" && n > VK_FOLD;

  return (
    <div className="space-y-3 rounded-2xl bg-tile p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((x) => <button key={x.k} type="button" onClick={() => setTab(x.k)} aria-pressed={tab === x.k} className={`chip cursor-pointer !px-3 !py-1 text-xs ${tab === x.k ? "bg-accent-soft text-accent-ink" : ""}`}>{x.label}</button>)}
        <span className="ml-auto text-xs text-ink3">Знаков: {n}</span>
      </div>
      {!plain && !images.length && <p className="text-xs text-ink3">Напишите текст, и здесь появится предпросмотр.</p>}
      {(plain || images.length > 0) && (
        <div className="mx-auto max-w-sm space-y-2 text-[#1c1f23]">
          {tab === "telegram" && (<>
            {images.length > 0 ? (
              <div className="rounded-2xl rounded-bl-md bg-white p-1.5 shadow-sm">
                <div className="px-2 pt-1 text-xs font-semibold text-[#2b7de9]">{name}</div>
                <div className="mt-1"><Photos urls={images} rounded="rounded-xl" /></div>
                {tg.caption && <p className="whitespace-pre-wrap px-2 py-1.5 text-[13.5px] leading-5"><Rich text={tg.caption} /></p>}
                {!tg.photoOnly && !tg.caption && <p className="whitespace-pre-wrap px-2 py-1.5 text-[13.5px] leading-5"><Rich text={plain.slice(0, TG_MSG)} /></p>}
              </div>
            ) : null}
            {(tg.photoOnly || !images.length) && plain && (
              <div className="rounded-2xl rounded-bl-md bg-white px-3 py-2 shadow-sm">
                {!images.length && <div className="text-xs font-semibold text-[#2b7de9]">{name}</div>}
                <p className="whitespace-pre-wrap text-[13.5px] leading-5"><Rich text={plain.slice(0, TG_MSG)} /></p>
              </div>
            )}
          </>)}
          {tab === "vk" && (
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2"><span className="grid size-9 place-items-center rounded-full bg-[#0077ff] text-xs font-semibold text-white">{(name[0] ?? "?").toUpperCase()}</span><div><div className="text-[13px] font-semibold">{name}</div><div className="text-[11px] text-[#818c99]">только что</div></div></div>
              {plain && <p className="whitespace-pre-wrap text-[13.5px] leading-5"><Rich text={folded ? `${plain.slice(0, VK_FOLD).trimEnd()}…` : plain} /></p>}
              {folded && <span className="mt-1 block text-[13px] text-[#2b7de9]">Показать полностью…</span>}
              {images.length > 0 && <div className="mt-2"><Photos urls={images} rounded="rounded-lg" /></div>}
            </div>
          )}
          {tab === "max" && (
            <div className="rounded-2xl bg-white p-1.5 shadow-sm">
              <div className="px-2 pt-1 text-xs font-semibold text-[#7c3aed]">{name}</div>
              {images.length > 0 && <div className="mt-1"><Photos urls={images.slice(0, 10)} /></div>}
              {plain && <p className="whitespace-pre-wrap px-2 py-1.5 text-[13.5px] leading-5"><Rich text={plain.slice(0, MAX_MSG)} /></p>}
            </div>
          )}
        </div>
      )}
      {warn.map((w, i) => <p key={i} className="flex items-start gap-1.5 text-xs text-warn"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{w}</p>)}
    </div>
  );
}
