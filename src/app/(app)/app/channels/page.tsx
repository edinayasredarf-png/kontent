import { Radio, Trash2 } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { Form, Field } from "@/components/Form";
import { deleteChannel, saveChannel } from "@/lib/actions";
import { PageHead, Empty } from "@/components/ui";

const KINDS: Record<string, string> = { telegram: "Telegram", vk: "ВКонтакте", dzen: "Дзен", site: "Сайт (webhook)", webhook: "Webhook" };

export default async function Channels() {
  const c = await requireCtx();
  const brands = await q<{ id: string; name: string }>("select id,name from brands where org_id=$1 order by name", [c.org.id]);
  const rows = await q<{ id: string; kind: string; title: string; brand: string }>(
    "select ch.id,ch.kind,ch.title,b.name brand from channels ch join brands b on b.id=ch.brand_id where ch.org_id=$1 order by ch.created_at", [c.org.id]);
  return (
    <>
      <PageHead title="Каналы" sub="Куда публикуем. Канал принадлежит бренду." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          {rows.length === 0 ? <Empty icon={<Radio />} title="Каналов нет" text="Подключите Telegram-канал или VK-сообщество справа." /> : (
            <div className="card">{rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                <span className="chip">{KINDS[r.kind]}</span><span className="flex-1 text-sm">{r.title}</span><span className="text-xs text-ink3">{r.brand}</span>
                <form action={deleteChannel}><input type="hidden" name="id" value={r.id} /><button className="text-ink3 hover:text-bad"><Trash2 size={15} /></button></form>
              </div>))}
            </div>
          )}
        </div>
        <div className="card h-fit p-5">
          <b className="mb-4 block text-sm">Добавить канал</b>
          {brands.length === 0 ? <p className="text-sm text-ink2">Сначала создайте бренд.</p> : (
            <Form action={saveChannel} submit="Подключить">
              <Field label="Бренд"><select name="brand_id" className="input">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label="Тип"><select name="kind" className="input">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Название"><input name="title" className="input" /></Field>
              <Field label="Токен бота / ключ"><input name="token" type="password" autoComplete="off" className="input" /></Field>
              <Field label="Чат / сообщество / URL"><input name="target" className="input" placeholder="@channel или -100…" /></Field>
            </Form>
          )}
        </div>
      </div>
    </>
  );
}
