import { Download } from "lucide-react";

/** Меню «Скачать» у материала: текстовые форматы, Word, HTML (для SEO, рассылок и гайдов) и архив с картинками. */
export function ExportMenu({ id, kind, hasImages }: { id: string; kind: string; hasImages: boolean }) {
  const f = (fmt: string, label: string) => <a key={fmt} href={`/api/export/${id}/file?format=${fmt}`} className="block rounded-lg px-3 py-1.5 text-sm hover:bg-tile" download>{label}</a>;
  return (
    <details className="relative">
      <summary className="btn btn-ghost !py-1.5 cursor-pointer list-none"><Download size={14} />Скачать</summary>
      <div className="absolute left-0 z-20 mt-1 min-w-[12rem] rounded-xl border border-line bg-surface p-1 shadow-lg">
        {f("txt", "Текст (.txt)")}{f("md", "Markdown (.md)")}{f("docx", "Word (.docx)")}
        {["seo", "email", "guide"].includes(kind) && f("html", "HTML (.html)")}
        {hasImages && f("zip", "Архив: текст и картинки (.zip)")}
      </div>
    </details>
  );
}
