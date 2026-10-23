import Link from "next/link";
import { BarChart3, Bookmark, CalendarRange, FileText, Folder, Image as Img, Lightbulb, Mic, PenLine, Rocket, Wand2, Clapperboard, Layers } from "lucide-react";
import { Heart } from "lucide-react";
import { pageCtx } from "@/lib/auth";
import { favoriteTools, toggleFavoriteAction } from "@/lib/studio-actions";
import { TOOLS } from "@/lib/studio";
import { TAGS } from "@/lib/studio-catalog";
import { PageHead } from "@/components/ui";

import { SubmitButton } from "@/components/SubmitButton";
const ICON: Record<string, typeof Wand2> = { text: FileText, hooks: Lightbulb, script: Clapperboard, viral: Rocket, image: Img, cover: Layers, voice: Mic, random: Rocket, image2text: Img };

const ICON_FALLBACK = Wand2;
const TAG_CLS: Record<string, string> = { Текст: "bg-accent-soft text-accent-ink", Посты: "bg-tile text-ink2", Идеи: "bg-warn-soft text-warn", Истории: "bg-bad-soft text-bad", Видео: "bg-good-soft text-good", Планирование: "bg-accent-soft text-accent-ink", Изображения: "bg-warn-soft text-warn", Инструменты: "bg-tile text-ink2" };

export default async function Studio({ searchParams }: { searchParams: Promise<{ tag?: string; fav?: string }> }) {
  const sp = await searchParams;
  const c = await pageCtx("write");
  const favs = await favoriteTools(c.user.id);
  const tag = (TAGS as readonly string[]).includes(sp.tag ?? "") ? sp.tag! : "";
  const onlyFav = sp.fav === "1";
  const list = TOOLS.filter((t) => (!tag || t.tags.includes(tag)) && (!onlyFav || favs.includes(t.key)));
  const more = [
    { href: "/app/studio/bank", t: "Мои карточки", d: "Сохранённые результаты и идеи. Любую можно отправить в план завода.", i: Bookmark },
    { href: "/app/studio/library", t: "Библиотека", d: "Все созданные в студии картинки и аудио.", i: Folder },
  ];
  const agents = [
    { href: "/app/factories", t: "Планировщик контента", d: "Контент-план на 7–30 дней в заводе, по расписанию и без повторов.", i: CalendarRange },
    { href: "/app/analytics", t: "Аналитик", d: "Просмотры и реакции постов, лучшее время, рекомендации ИИ.", i: BarChart3 },
  ];
  const chip = (active: boolean) => `rounded-full px-3 py-1.5 text-sm ${active ? "bg-accent text-white" : "bg-tile text-ink2 hover:bg-tile2"}`;
  return (
    <>
      <PageHead title="ИИ-ассистенты" sub="Разовая работа без завода: короткие инструменты на каждый случай. Цена видна на карточке, результат можно скопировать, сохранить и отправить в план." />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href="/app/studio" className={chip(!tag && !onlyFav)}>Все</Link>
        <Link href="/app/studio?fav=1" className={`${chip(onlyFav)} inline-flex items-center gap-1`}><Heart size={13} />Избранное{favs.length ? ` ${favs.length}` : ""}</Link>
        {TAGS.map((t) => <Link key={t} href={`/app/studio?tag=${encodeURIComponent(t)}`} className={chip(tag === t)}>{t}</Link>)}
      </div>
      {list.length === 0 && <p className="card mb-6 px-6 py-10 text-center text-sm text-ink2">{onlyFav ? "Избранных инструментов пока нет: нажмите сердечко на карточке." : "По этому тегу ничего нет."}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((t) => { const I = ICON[t.key] ?? ICON_FALLBACK; const fav = favs.includes(t.key); return (
          <div key={t.key} className="card relative p-5 transition hover:border-accent/40">
            <Link href={`/app/studio/${t.key}`} className="block">
              <div className="mb-3 flex flex-wrap gap-1.5 pr-8">{t.tags.slice(0, 2).map((g) => <span key={g} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TAG_CLS[g] ?? "bg-tile text-ink2"}`}>{g}</span>)}</div>
              <div className="mb-2 grid size-10 place-items-center rounded-xl bg-tile text-accent"><I size={20} /></div>
              <b className="block">{t.title}</b>
              <p className="mt-1 text-sm text-ink2">{t.desc}</p>
              <p className="mt-2 text-xs text-ink3">{t.priceLabel} · {t.agent}</p>
            </Link>
            <form action={toggleFavoriteAction} className="absolute right-3 top-3"><input type="hidden" name="tool" value={t.key} />
              <SubmitButton className={`rounded-lg p-1.5 hover:bg-tile ${fav ? "text-bad" : "text-ink3"}`} title={fav ? "Убрать из избранного" : "В избранное"} aria-label={fav ? "Убрать из избранного" : "В избранное"}><Heart size={17} fill={fav ? "currentColor" : "none"} /></SubmitButton></form>
          </div>); })}
      </div>
      {!tag && !onlyFav && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      )}
    </>
  );
}
