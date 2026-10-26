"use client";
import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AutoTextarea } from "./AutoTextarea";
import { AiTextTools } from "./AiTextTools";
import { PostPreview } from "./PostPreview";
import { useServerDraft } from "@/lib/draft-store";

/** Текст черновика: поле, которое растёт под текст, ИИ-правка и предпросмотр по соцсетям (по актуальному тексту в поле). */
export function DraftBodyEditor({ initial, images, kinds, oneMessageTg, name, price, kind, storeKey }: { storeKey?: string; initial: string; images: string[]; kinds: string[]; oneMessageTg: boolean; name: string; price: string; kind?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initial);
  const [show, setShow] = useState(false);
  const draft = useServerDraft(`body:${storeKey ?? "x"}`, initial);
  // AutoTextarea подгоняет высоту сам по событию input; при программной замене текста вызываем его вручную
  const apply = (t: string) => { setText(t); if (storeKey) draft.remember(t); const el = ref.current; if (el) { el.value = t; el.dispatchEvent(new Event("input", { bubbles: true })); } };
  return (
    <div className="space-y-2">
      <AutoTextarea ref={ref} name="body" defaultValue={initial} rows={6} onChange={(e) => { setText(e.target.value); if (storeKey) draft.remember(e.target.value); }} className="input !rounded-2xl !bg-surface text-sm leading-6" />
      {storeKey && draft.restored != null && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">Найден несохранённый текст из прошлого раза.
          <button type="button" onClick={() => { apply(draft.restored!); draft.hide(); }} className="link-btn">Вернуть мою правку</button>
          <button type="button" onClick={draft.drop} className="link-btn link-btn-quiet">Оставить сохранённый</button></p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink3">
        <span>Знаков: {text.length}</span>
        <button type="button" onClick={() => setShow((v) => !v)} className="chip chip-toggle ml-auto cursor-pointer !px-3 !py-1 text-xs">{show ? <EyeOff size={13} className="mr-1" /> : <Eye size={13} className="mr-1" />}{show ? "Скрыть предпросмотр" : kind === "story" ? "Как это выглядит как сторис" : "Как это будет выглядеть"}</button>
      </div>
      <AiTextTools getText={() => ref.current?.value ?? text} setText={apply} price={price} />
      {show && <PostPreview text={text} images={images} kinds={kinds} oneMessageTg={oneMessageTg} name={name} kind={kind} />}
    </div>
  );
}
