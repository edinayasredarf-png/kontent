"use client";
import { useState } from "react";
import { Loader2, Magnet } from "lucide-react";
import { CopyText } from "./CopyText";
import { leadMagnetAction } from "@/lib/lead-actions";
import { MECHANICS, leadBlockText, leadSteps, ownerTip, type LeadMeta, type Mechanic } from "@/lib/lead-magnet";

/**
 * Как гайд работает как лид-магнит: способ получения, текст завлекающего блока (заголовок, выгоды, кнопка), что нужно сделать человеку,
 * чтобы получить гайд, и анонс-пост. Тексты пишет ИИ по содержанию гайда; «что сделать» собирается из выбранного способа и кодового слова.
 */
export function LeadMagnetPanel({ itemId, initial, brandName, price }: { itemId: string; initial: LeadMeta | null; brandName: string; price: string }) {
  const [mechanic, setMechanic] = useState<Mechanic>(initial?.mechanic ?? "email");
  const [keyword, setKeyword] = useState(initial?.keyword ?? "ГАЙД");
  const [lead, setLead] = useState<LeadMeta | null>(initial);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const needKw = mechanic === "subscribe" || mechanic === "comment";

  async function go() {
    setBusy(true); setErr("");
    const r = await leadMagnetAction(itemId, mechanic, keyword).catch(() => null);
    setBusy(false);
    if (r?.ok) setLead(r.lead); else setErr(r && !r.ok ? r.error : "Не удалось выполнить");
  }
  const steps = lead ? leadSteps(mechanic, keyword, lead.button, brandName) : [];
  const stale = !!lead && (lead.mechanic !== mechanic || (needKw && lead.keyword !== keyword));

  return (
    <div className="space-y-3 rounded-2xl bg-tile p-3">
      <div className="flex flex-wrap items-center gap-2"><b className="flex items-center gap-1.5 text-sm"><Magnet size={15} />Как это работает как лид-магнит</b><span className="text-xs text-ink3">Гайд отдаётся за действие. Выберите какое, и мы напишем текст блока и инструкцию.</span></div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1 text-xs text-ink2">За что человек получает гайд
          <select value={mechanic} onChange={(e) => setMechanic(e.target.value as Mechanic)} className="input mt-1 !bg-surface !py-1.5 text-sm">{Object.entries(MECHANICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        {needKw && <label className="text-xs text-ink2">Кодовое слово<input value={keyword} onChange={(e) => setKeyword(e.target.value.slice(0, 30))} className="input mt-1 !w-36 !bg-surface !py-1.5 text-sm uppercase" /></label>}
        <button type="button" onClick={go} disabled={busy} className="btn btn-accent !py-2">{busy && <Loader2 size={15} className="animate-spin" />}{lead ? "Придумать заново" : "Придумать тексты"}{price ? ` · ${price}` : ""}</button>
      </div>
      <p className="text-xs text-ink3">{MECHANICS[mechanic].hint}</p>
      {err && <p className="text-xs text-bad">{err}</p>}
      {stale && <p className="text-xs text-warn">Способ или кодовое слово изменились: нажмите «Придумать заново», чтобы обновить анонс. Шаги ниже уже обновлены.</p>}
      {lead && (
        <div className="space-y-3">
          <section className="space-y-1.5">
            <div className="flex items-center gap-2"><b className="text-xs">1. Завлекающий блок (для сайта или поста)</b><span className="ml-auto"><CopyText text={leadBlockText(lead)} label="Копировать блок" /></span></div>
            <div className="rounded-xl bg-white p-4 text-[#1c1f23] shadow-sm">
              <div className="text-[19px] font-bold leading-snug">{lead.headline}</div>
              {lead.sub && <div className="mt-1 text-[14px] text-[#4d5156]">{lead.sub}</div>}
              <ul className="mt-3 space-y-1.5 text-[14px]">{lead.bullets.map((b, i) => <li key={i} className="flex gap-2"><span className="text-[#2b7de9]">✓</span>{b}</li>)}</ul>
              <div className="mt-4 inline-block rounded-lg bg-[#2b7de9] px-4 py-2 text-[14px] font-semibold text-white">{lead.button}</div>
            </div>
          </section>
          <section className="space-y-1.5">
            <div className="flex items-center gap-2"><b className="text-xs">2. Что нужно сделать, чтобы получить гайд</b><span className="ml-auto"><CopyText text={steps.map((s, i) => `${i + 1}. ${s}`).join("\n")} label="Копировать шаги" /></span></div>
            <ol className="list-decimal space-y-1 rounded-xl bg-surface p-3 pl-8 text-sm">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </section>
          <section className="space-y-1.5">
            <div className="flex items-center gap-2"><b className="text-xs">3. Анонс-пост</b><span className="ml-auto"><CopyText text={lead.post} label="Копировать пост" /></span></div>
            <p className="whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm leading-6">{lead.post}</p>
          </section>
          <section className="rounded-xl bg-surface p-3 text-xs text-ink2"><b>Что настроить у себя.</b> {ownerTip(mechanic)}</section>
        </div>
      )}
    </div>
  );
}
