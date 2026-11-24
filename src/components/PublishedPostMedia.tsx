/** The analytics preview uses the original files through the tenant-authenticated asset endpoint. */
export function PublishedPostMedia({ assets, compact = false }: { assets: string[]; compact?: boolean }) {
  const list=assets.slice(0,compact?1:10);
  if (!list.length) return null;
  return <div className={`mt-3 grid gap-2 ${list.length>1?"grid-cols-2":"grid-cols-1"}`}>{list.map((id,i)=>
    // eslint-disable-next-line @next/next/no-img-element
    <img key={id} src={`/api/assets/${id}`} alt={`Изображение материала ${i+1}`} loading="lazy" className={`w-full rounded-xl bg-surface object-contain ${compact?"aspect-[4/3] max-h-60 !object-cover":"max-h-[560px]"}`}/>
  )}</div>;
}
