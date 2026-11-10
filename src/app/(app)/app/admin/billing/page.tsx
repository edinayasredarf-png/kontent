import { loadOperator } from "@/lib/legal";
import { requireAdmin } from "@/lib/admin";
import { planCatalog, FEATURE_KEYS } from "@/lib/plan-catalog";
import { yooConfig } from "@/lib/yookassa";
import { saveOperatorAction, savePaymentConfigAction, testPaymentConfigAction, savePlanAction } from "@/lib/payment-actions";
import { q } from "@/lib/db";
import { rub } from "@/lib/wallet";
import { AdminNav } from "@/components/AdminNav";
import { Form } from "@/components/Form";
import { PageHead } from "@/components/ui";
const LABELS: Record<string, string> = { create: "Создание контента и помощники", monitor: "Мониторинг новостей", analytics: "Аналитика", studio: "Студия", autopublish: "Автопубликация" };
export default async function AdminBilling() {
  await requireAdmin();
  const operator = await loadOperator();
  const [config, catalog, orders] = await Promise.all([yooConfig(), planCatalog(), q<{ id: string; name: string; amount_kop: string; status: string; test_mode: boolean; created_at: string }>("select p.id,o.name,p.amount_kop,p.status,p.test_mode,p.created_at from kz_payment_orders p join kz_orgs o on o.id=p.org_id order by p.created_at desc limit 30")]);
  return <>
    <PageHead title="Тарифы и оплата" sub="Цена покупки — в рублях, баланс и стоимость действий — в токенах JuicerAI." />
    <AdminNav active="/app/admin/billing" />
    <section className="card mb-6 space-y-4 p-5">
      <h2 className="font-semibold">ЮKassa · {config.testMode ? "тестовый магазин" : "боевой магазин"}</h2>
      <p className="text-sm text-ink2">Сначала проверьте оплату в тестовом магазине. Тестовые платежи фиксируются отдельно и не начисляют реальные токены. Для запуска смените магазин, ключ и режим.</p>
      <Form action={savePaymentConfigAction} submit="Сохранить настройки" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><label>shopId<input name="shopId" defaultValue={config.shopId} required className="input mt-1" /></label><label>Секретный ключ<input type="password" autoComplete="new-password" name="secret" placeholder={config.secret ? "Сохранён · оставьте пустым, чтобы не менять" : "test_…"} className="input mt-1" /></label></div>
        <label className="block">Адрес сайта<input type="url" name="origin" required defaultValue={config.origin} className="input mt-1" /></label>
        <label className="flex gap-2"><input name="testMode" type="checkbox" defaultChecked={config.testMode} />Тестовый режим (ключ test_…)</label>
        <label className="flex gap-2"><input name="enabled" type="checkbox" defaultChecked={config.enabled} />Разрешить переход к оплате</label>
        <label className="flex gap-2"><input name="receipt" type="checkbox" defaultChecked={config.receipt} />Передавать чек в ЮKassa (если отключено, чек оформляет ваша внешняя касса)</label>
        <div className="grid gap-4 sm:grid-cols-2"><label>Код НДС для чека<input type="number" name="vatCode" min="1" max="12" defaultValue={config.vatCode} className="input mt-1" /><span className="text-xs text-ink3">Код 1 — без НДС. Сверьте с настройками своего магазина.</span></label><label>Код системы налогообложения<input type="number" name="taxSystem" min="1" max="6" defaultValue={config.taxSystem ?? ""} className="input mt-1" /><span className="text-xs text-ink3">Пусто — система из настроек магазина.</span></label></div>
      </Form>
      <Form action={testPaymentConfigAction} submit="Проверить подключение" variant="ghost"><span className="text-xs text-ink3">Проверка ключа без создания платежа.</span></Form>
      <p className="break-all rounded-xl bg-tile p-3 text-sm">В ЮKassa добавьте адрес уведомлений: <code>{config.origin}/api/payments/yookassa</code> · события payment.succeeded, payment.canceled.</p>
      <a href="https://yookassa.ru/developers/using-api/webhooks" target="_blank" rel="noreferrer" className="link-btn text-sm">Инструкция ЮKassa по уведомлениям</a>
    </section>
    <section className="card mb-6 space-y-4 p-5"><h2 className="font-semibold">Реквизиты получателя оплаты</h2><p className="text-sm text-ink2">Укажите того же ИП или организацию, на которых оформлен магазин ЮKassa. Данные появятся на странице /requisites и в документах сайта.</p>
      <Form action={saveOperatorAction} submit="Сохранить реквизиты" className="grid gap-4 sm:grid-cols-2">
        {([['name','Полное наименование'],['inn','ИНН'],['ogrn','ОГРН / ОГРНИП'],['address','Адрес для обращений'],['email','Контактный email'],['phone','Телефон'],['site','Сайт'],['bank','Наименование банка'],['account','Расчётный счёт'],['corrAccount','Корреспондентский счёт'],['bic','БИК']] as const).map(([key,label]) => <label key={key} className="text-sm">{label}<input name={key} defaultValue={operator[key]} required={['name','inn','ogrn','address','email','site'].includes(key)} className="input mt-1" /></label>)}
      </Form>
    </section>
    <section className="space-y-4">
      <h2 className="font-semibold">Тарифы</h2><p className="text-sm text-ink2">Токены не сгорают. Функции и безлимит моделей действуют в течение оплаченного срока. Повторная покупка такого же пакета продлевает срок; другой пакет начинает действовать сразу без пересчёта прошлой покупки.</p>
      {Object.values(catalog).map(p => <details key={p.key} className="card p-5"><summary className="cursor-pointer font-semibold">{p.name} · {rub(Math.round(p.priceRub * 100))} · {p.tokens.toLocaleString("ru-RU")} токенов</summary>
        <Form action={savePlanAction} submit="Сохранить тариф" className="mt-4 space-y-4"><input type="hidden" name="key" value={p.key} />
          <div className="grid gap-3 sm:grid-cols-2"><label>Название<input name="name" required defaultValue={p.name} className="input mt-1" /></label><label>Цена покупки, ₽<input type="number" name="priceRub" min="0" step="0.01" required defaultValue={p.priceRub} className="input mt-1" /></label><label>Токенов в пакете<input type="number" name="tokens" min="0" step="0.01" required defaultValue={p.tokens} className="input mt-1" /></label><label>Срок, дней<input type="number" name="durationDays" min="1" max="366" required defaultValue={p.durationDays} className="input mt-1" /></label>
          {([['brands','Брендов'],['factories','Заводов'],['members','Участников'],['sources','Источников']] as const).map(([k,l]) => <label key={k}>{l}<input type="number" name={k} min="0" max="100000" defaultValue={p[k] ?? ""} placeholder="Пусто — без ограничения" className="input mt-1" /></label>)}</div>
          <fieldset className="space-y-2"><legend className="mb-2 font-medium">Доступные функции</legend>{FEATURE_KEYS.map(k => <label key={k} className="flex gap-2 text-sm"><input name={`cap_${k}`} type="checkbox" defaultChecked={p.capabilities?.includes(k)} />{LABELS[k]}</label>)}</fieldset>
          <label className="block">Описание преимуществ (по строке)<textarea name="features" defaultValue={p.features.join("\n")} rows={3} className="input mt-1" /></label>
          <label className="block">Безлимит моделей (точные ID, по строке)<textarea name="unlimitedModels" defaultValue={p.unlimitedModels.join("\n")} rows={3} className="input mt-1" /><span className="text-xs text-ink3">Только реально подключённые модели. Безлимит относится к операции выбранной модели; другие модели расходуют токены.</span></label>
          <label className="flex gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={p.enabled} />Показывать тариф пользователям</label>
        </Form>
      </details>)}
    </section>
    <section className="card mt-6 p-5"><h2 className="mb-3 font-semibold">Последние платежи</h2>{orders.length ? orders.map(o => <div key={o.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-3 text-sm"><span>{o.name} · {o.test_mode ? "Тест" : "Боевой"}</span><span>{rub(Number(o.amount_kop))} · {o.status} · {new Date(o.created_at).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}</span></div>) : <p className="text-sm text-ink3">Платежей пока нет.</p>}</section>
  </>;
}
