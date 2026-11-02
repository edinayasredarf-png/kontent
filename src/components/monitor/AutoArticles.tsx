"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loadArticlesAction } from "@/lib/monitor/actions";
import type { ArticleData } from "@/lib/monitor/article-state";

const Articles = createContext<{ data: Record<string, ArticleData>; done: Set<string> }>({ data: {}, done: new Set() });
export const useAutoArticle = () => useContext(Articles);

/** Fetch small batches after the feed is visible. Update cards locally without re-requesting the whole page. */
export function AutoArticles({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [state, setState] = useState<{ data: Record<string, ArticleData>; done: Set<string> }>({ data: {}, done: new Set() });
  const requests = useRef(new Map<string, Promise<ArticleData[]>>());
  const key = ids.join(",");
  useEffect(() => {
    let active = true;
    const queue = key ? key.split(",") : [];
    const load = async () => {
      for (let i = 0; i < queue.length && active; i += 3) {
        const batch = queue.slice(i, i + 3), batchKey = batch.join(",");
        let pending = requests.current.get(batchKey);
        if (!pending) { pending = loadArticlesAction(batch); requests.current.set(batchKey, pending); }
        let rows: ArticleData[] = [];
        try { rows = await pending; } catch { /* The excerpt remains available with an explicit retry. */ }
        if (!active) return;
        setState((prev) => ({ data: { ...prev.data, ...Object.fromEntries(rows.map((r) => [r.id, r])) }, done: new Set([...prev.done, ...batch]) }));
      }
    };
    void load();
    return () => { active = false; };
  }, [key]);
  return <Articles.Provider value={state}>{children}</Articles.Provider>;
}
