"use client";
import { useState } from "react";
import { PenLine } from "lucide-react";
import { createFromNewsAction } from "@/lib/monitor/actions";
import { POST_TYPES } from "@/lib/postsettings";
import { ANGLES } from "@/lib/monitor/angles";
import { ImagePicker } from "@/components/ImagePicker";
import { SubmitButton } from "@/components/SubmitButton";

/** The closed create control ships data, not thirty complete sets of form markup. Opening it preserves the existing workflow. */
export function NewsCreate({ id, here, factories, kinds, fullText }: {
  id: string; here: string; factories: { id: string; name: string; brand: string }[]; kinds: { value: string; label: string }[]; fullText: boolean;
}) {
  const [opened, setOpened] = useState(false);
  return (<details className="w-full sm:w-auto" onToggle={(event) => { if (event.currentTarget.open) setOpened(true); }}>
    <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white"><PenLine size={14} />Создать</summary>
    {opened && <form action={createFromNewsAction} data-keep-scroll className="mt-3 space-y-3 rounded-xl bg-tile p-3">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="ret" value={here} />
      <div><label className="label">В какой завод</label><select name="factory" className="input !bg-surface">{factories.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.brand}</option>)}</select></div>
      <div><span className="label">Какие материалы создать по этой новости</span>
        <div className="flex flex-wrap gap-2">{kinds.map((k) => <label key={k.value} className="chip cursor-pointer !px-3 !py-1.5 chip-toggle"><input type="checkbox" name="kinds" value={k.value} defaultChecked={k.value === "post"} className="hidden" />{k.label}</label>)}</div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Как подать новость</label><select name="angle" defaultValue="retell" className="input !bg-surface">{Object.entries(ANGLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div><label className="label">Стиль написания</label><select name="postType" defaultValue="" className="input !bg-surface"><option value="">По настройкам завода</option>{Object.entries(POST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Дата в плане (для идей)</label><input type="date" name="date" className="input !bg-surface" /><p className="mt-1 text-xs text-ink3">Нужна, если выбрано «Только в контент-план». При «Создать сразу» дату и время спросим, когда отправите материал в план.</p></div>
        <div><span className="label">Изображение</span><ImagePicker hint="Своё фото к посту; ИИ его не заменит." /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select name="mode" className="input !w-auto !bg-surface"><option value="now">Создать сразу</option><option value="ideas">Только в контент-план (идеи)</option></select>
        <SubmitButton className="btn !py-1.5">Создать</SubmitButton>
      </div>
      <p className="text-xs text-ink3">Тексты пишутся по {fullText ? "полному тексту статьи" : "тексту новости из ленты (для сайтов загрузите полный текст кнопкой выше)"}, факты берутся оттуда, манера письма и факты о компании берутся из базы знаний бренда. Цена за каждый тип как обычно.</p>
    </form>}
  </details>);
}
