import Link from "next/link";
import { ArrowLeft, Download, Folder, Trash2 } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { orgUsage, ORG_QUOTA_BYTES } from "@/lib/assets";
import { deleteStudioAssetAction } from "@/lib/studio-actions";
import { Empty, PageHead } from "@/components/ui";

export default async function Library() {
  const c = await requireCtx();
  const [rows, used] = await Promise.all([
    q<{ id: string; name: string; mime: string; size: number; created_at: string }>("select id,name,mime,size,created_at from kz_assets where org_id=$1 and kind='studio' order by created_at desc limit 200", [c.org.id]),
    orgUsage(c.org.id),
  ]);
  return (
    <>
      <Link href="/app/studio" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Студия</Link>
      <PageHead title="Библиотека" sub={`Занято ${(used / 1048576).toFixed(1)} из ${ORG_QUOTA_BYTES / 1048576} МБ (вместе с брендбуком и картинками материалов)`} />
      {rows.length === 0 ? <Empty icon={<Folder />} title="Пока пусто" text="Картинки и озвучки из студии сохраняются сюда." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="card overflow-hidden">
              {r.mime.startsWith("image/") ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${r.id}`} alt={r.name} className="aspect-square w-full object-cover" />
                : <div className="p-4"><audio controls src={`/api/assets/${r.id}`} className="w-full" /></div>}
              <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-ink2">
                <span className="min-w-0 flex-1 truncate">{new Date(r.created_at).toLocaleDateString("ru-RU")} · {(r.size / 1024).toFixed(0)} КБ</span>
                <a href={`/api/assets/${r.id}?dl=1`} title="Скачать" className="text-ink3 hover:text-ink"><Download size={15} /></a>
                <form action={deleteStudioAssetAction}><input type="hidden" name="id" value={r.id} /><button title="Удалить" className="text-ink3 hover:text-bad"><Trash2 size={15} /></button></form>
              </div>
            </div>))}
        </div>
      )}
    </>
  );
}
