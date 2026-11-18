import Link from "next/link";
import { pageCtx } from "@/lib/auth";
import { ownedConnection } from "@/lib/channel-connections";
import { ChannelConnectPanel } from "@/components/ChannelConnectPanel";
export const dynamic = "force-dynamic";
export default async function Connect({ searchParams }: { searchParams: Promise<{ connection?: string; error?: string }> }) {
  const c = await pageCtx("manage"), p = await searchParams;
  const row = p.connection && /^[0-9a-f-]{36}$/i.test(p.connection) ? await ownedConnection(c.org.id, c.user.id, p.connection) : null;
  return <div className="mx-auto w-full max-w-2xl space-y-6 py-6"><Link href="/app/channels" className="text-sm text-ink2">← Каналы</Link><h1 className="text-2xl font-semibold">Подключение канала</h1>{p.error && <p role="alert" className="rounded-2xl bg-bad-soft p-4 text-sm text-bad">{p.error}</p>}{row ? <ChannelConnectPanel provider={row.provider} brandId={row.brand_id} factoryId={row.factory_id || undefined} initialId={row.id} /> : !p.error && <p className="text-ink2">Подключение истекло или уже завершено. Начните заново в разделе «Каналы».</p>}{row?.factory_id && <Link className="btn btn-ghost" href={`/app/factories/${row.factory_id}?tab=settings`}>Вернуться в завод</Link>}</div>;
}
