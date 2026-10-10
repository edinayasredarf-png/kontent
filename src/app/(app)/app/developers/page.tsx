import { KeyRound, Trash2 } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { listKeys, RATE_PER_MINUTE } from "@/lib/apikeys";
import { canManageTeam } from "@/lib/team";
import { createKeyAction, revokeKeyAction } from "@/lib/apikeys-actions";
import { SITE } from "@/lib/site";
import { Field, Form } from "@/components/Form";
import { PageHead } from "@/components/ui";

const ENDPOINTS: [string, string, string][] = [
  ["GET", "/api/v1/me", "Организация, баланс и остаток лимита запросов"],
  ["GET", "/api/v1/brands", "Список брендов"],
  ["GET", "/api/v1/factories", "Список заводов (id нужны для создания материалов)"],
  ["GET", "/api/v1/items?factory=&status=&limit=&offset=", "Список материалов"],
  ["GET", "/api/v1/items/{id}", "Материал и результаты его публикаций"],
  ["POST", "/api/v1/items", "Создать идею {factory, topic, hook?, kind?, date?, approve?} или готовый пост, если передан body"],
  ["POST", "/api/v1/items/{id}/publish", "Поставить готовый материал в очередь публикации"],
  ["POST", "/api/v1/factories/{id}/plan", "Сгенерировать план {days: 1–30} (списывается как в кабинете)"],
  ["POST", "/api/v1/factories/{id}/repurpose", "Разобрать статью {url} или {text} на материалы {count: 3–10}"],
  ["GET", "/api/v1/stats?days=30", "Сводка по просмотрам и реакциям"],
];

export default async function Developers() {
  const c = await requireCtx();
  const keys = await listKeys(c.org.id);
  const can = canManageTeam(c.org.role);
  return (
    <>
      <PageHead title="Интеграции и API" sub="Подключайте Контент-завод к n8n, Make, Zapier и своим скриптам." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card p-5">
            <b className="text-sm">Ключи доступа</b>
            {keys.length === 0 && <p className="mt-2 text-sm text-ink2">Ключей пока нет.</p>}
            <div className="mt-3 divide-y divide-line">
              {keys.map((k) => (
                <div key={k.id} className={`flex flex-wrap items-center gap-3 py-2.5 text-sm ${k.revoked ? "opacity-50" : ""}`}>
                  <KeyRound size={15} className="text-ink3" /><span className="font-medium">{k.name}</span><code className="text-xs text-ink3">{k.prefix}…</code>
                  <span className="chip">{k.role === "viewer" ? "только чтение" : "чтение и запись"}</span>
                  <span className="ml-auto text-xs text-ink3">{k.revoked ? "отозван" : k.last_used_at ? `использован ${new Date(k.last_used_at).toLocaleDateString("ru-RU")}` : "не использовался"}</span>
                  {can && !k.revoked && <form action={revokeKeyAction}><input type="hidden" name="id" value={k.id} /><button className="text-ink3 hover:text-bad" title="Отозвать"><Trash2 size={15} /></button></form>}
                </div>
              ))}
            </div>
          </section>
          <section className="card p-5">
            <b className="mb-3 block text-sm">Методы API</b>
            <p className="mb-3 text-xs text-ink2">Адрес: <code>{SITE}</code>. Заголовок <code>Authorization: Bearer lt_…</code>. Ответы в JSON, ошибки вида <code>{`{"error":"…"}`}</code>. Лимит {RATE_PER_MINUTE} запросов в минуту на ключ. Генерация списывает деньги так же, как в кабинете.</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><tbody>
              {ENDPOINTS.map(([m, p, d]) => (
                <tr key={m + p} className="border-t border-line align-top"><td className="py-2 pr-3"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${m === "GET" ? "bg-accent-soft text-accent-ink" : "bg-good-soft text-good"}`}>{m}</span></td><td className="py-2 pr-3"><code className="text-xs">{p}</code></td><td className="py-2 text-xs text-ink2">{d}</td></tr>
              ))}</tbody></table></div>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-tile p-3 text-xs">{`curl -X POST ${SITE}/api/v1/items \\
  -H "Authorization: Bearer lt_ВАШ_КЛЮЧ" \\
  -H "Content-Type: application/json" \\
  -d '{"factory":"ID_ЗАВОДА","topic":"5 ошибок в закупках","approve":true}'`}</pre>
          </section>
        </div>
        <section className="card h-fit p-5">
          <b className="mb-3 block text-sm">Новый ключ</b>
          {can ? (
            <Form action={createKeyAction} submit="Создать ключ">
              <Field label="Название"><input name="name" required minLength={2} maxLength={60} placeholder="Например: n8n" className="input" /></Field>
              <Field label="Права"><select name="role" className="input"><option value="editor">Чтение и запись</option><option value="viewer">Только чтение</option></select></Field>
              <p className="text-xs text-ink3">Ключ показывается один раз. Храните его как пароль и не вставляйте в публичные места.</p>
            </Form>
          ) : <p className="text-sm text-ink2">Ключи создают владелец и администратор организации.</p>}
        </section>
      </div>
    </>
  );
}
