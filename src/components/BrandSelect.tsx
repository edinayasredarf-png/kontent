"use client";
import { useRouter } from "next/navigation";

/** Переключатель бренда на вкладке «База знаний»: выбор сразу открывает базу другого бренда. */
export function BrandSelect({ brands, current }: { brands: { id: string; name: string }[]; current: string }) {
  const router = useRouter();
  return <select value={current} onChange={(e) => router.push(`/app/brands/${e.target.value}/knowledge`)} className="input">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>;
}
