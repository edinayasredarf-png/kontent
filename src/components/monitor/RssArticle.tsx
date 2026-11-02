"use client";
import { Loader2 } from "lucide-react";
import { ARTICLE_STATUS, articleNeedsLoading, type ArticleData } from "@/lib/monitor/article-state";
import { enrichItemAction } from "@/lib/monitor/actions";
import { NewsMedia } from "./NewsMedia";
import { PostText } from "./PostText";
import { useAutoArticle } from "./AutoArticles";
import { SubmitButton } from "../SubmitButton";

export function RssArticle({ item, kind, write }: { item: ArticleData; kind: string; write: boolean }) {
  const auto = useAutoArticle();
  // A fresh server snapshot takes precedence after an explicit refresh or another action.
  const r = item.full_status === ARTICLE_STATUS && item.full_text ? item : auto.data[item.id] ?? item;
  const loaded = r.full_status === ARTICLE_STATUS && !!r.full_text;
  const loading = articleNeedsLoading(kind, r.full_status, r.full_text) && !auto.done.has(item.id);
  const text = loaded ? r.full_text! : r.body || r.title;
  return <>
    <NewsMedia media={r.media ?? []} title={r.title} />
    <PostText title={r.title} text={text} />
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink3">
      {loading ? <span role="status" className="inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />Загружаем статью…</span> : <span>{loaded ? (r.full_text!.length < 150 && r.media?.some((m) => m.type === "file") ? "Документ во вложении" : `Статья загружена · ${r.full_text!.length.toLocaleString("ru-RU")} знаков`) : "Показан анонс из RSS. Полный материал — на сайте источника."}</span>}
      {!loading && write && r.full_status !== "unsupported" && <form action={enrichItemAction}><input type="hidden" name="id" value={r.id} /><SubmitButton className="btn btn-ghost !px-2.5 !py-1 text-xs">{loaded ? "Обновить статью" : "Повторить загрузку"}</SubmitButton></form>}
    </div>
  </>;
}
