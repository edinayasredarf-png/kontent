import Link from "next/link";
import { BarChart3, Bookmark, CalendarRange, FileText, Folder, Image as Img, Lightbulb, Mic, PenLine, Rocket, Wand2, Clapperboard, Layers } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { TOOLS } from "@/lib/studio";
import { PageHead } from "@/components/ui";

const ICON: Record<string, typeof Wand2> = { text: FileText, hooks: Lightbulb, script: Clapperboard, viral: Rocket, image: Img, cover: Layers, voice: Mic };

export default async function Studio() {
  await requireCtx();
  const more = [
    { href: "/app/studio/bank", t: "Банк идей", a: "Банк идей", d: "Сохранённые идеи и заготовки. Любую можно отправить в план завода.", i: Bookmark },
    { href: "/app/studio/library", t: "Библиотека", a: "Библиотека", d: "Все созданные в студии картинки и аудио.", i: Folder },
  ];
  const agents = [
    { href: "/app/factories", t: "Планировщик контента", d: "Контент-план на 7–30 дней в заводе, по расписанию и без повторов.", i: CalendarRange },
    { href: "/app/analytics", t: "Аналитик", d: "Просмотры и реакции постов, лучшее время, рекомендации ИИ.", i: BarChart3 },
  ];
  return (
    <>
      <PageHead title="Студия и ИИ-агенты" sub="Разовая работа без завода. Каждый инструмент — отдельный ИИ-помощник; цена видна на кнопке." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => { const I = ICON[t.key] ?? Wand2; return (
          <Link key={t.key} href={`/app/studio/${t.key}`} className="card p-5 transition hover:border-accent/40">
            <div className="mb-3 grid size-10 place-items-center rounded-xl bg-tile text-accent"><I size={20} /></div>
            <div className="flex items-center justify-between"><b>{t.title}</b><span className="chip">{t.priceLabel}</span></div>
            <p className="mt-1 text-sm text-ink2">{t.desc}</p><p className="mt-2 text-xs text-ink3">Агент: {t.agent}</p>
          </Link>); })}
        {agents.map((a) => (
          <Link key={a.t} href={a.href} className="card p-5 transition hover:border-accent/40">
            <div className="mb-3 grid size-10 place-items-center rounded-xl bg-tile text-accent"><a.i size={20} /></div><b>{a.t}</b><p className="mt-1 text-sm text-ink2">{a.d}</p>
          </Link>))}
        {more.map((a) => (
          <Link key={a.t} href={a.href} className="card p-5 transition hover:border-accent/40">
            <div className="mb-3 grid size-10 place-items-center rounded-xl bg-tile text-ink2"><a.i size={20} /></div><b>{a.t}</b><p className="mt-1 text-sm text-ink2">{a.d}</p>
          </Link>))}
        <div className="card p-5 opacity-60">
          <div className="mb-3 grid size-10 place-items-center rounded-xl bg-tile text-ink3"><PenLine size={20} /></div><b>Видео, аватары, музыка, анимация</b>
          <p className="mt-1 text-sm text-ink2">Появятся, когда будут подключены соответствующие модели шлюза.</p>
        </div>
      </div>
    </>
  );
}
