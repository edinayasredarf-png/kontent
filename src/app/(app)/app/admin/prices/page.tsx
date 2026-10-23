import { requireAdmin } from "@/lib/admin";
import { econByAction, listModelPrices, PRICE_LABELS } from "@/lib/admin-econ";
import { deleteModelPriceAction, importLogsAction, pullGatewayModelsAction, resetPricesAction, saveModelPriceAction, savePricesAction } from "@/lib/admin-econ-actions";
import { bounds, parseRange } from "@/lib/range";
import { DEFAULT_PRICES, ensurePrices, PRICES, type PriceKey } from "@/lib/wallet";
import { ActionTable } from "@/components/AdminActionTable";
import { AdminNav } from "@/components/AdminNav";
import { Form } from "@/components/Form";
import { PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const r2 = (kop: number) => String(Math.round(kop) / 100);
const inp = "input !py-1.5 text-sm";

export default async function Prices() {
  await requireAdmin();
  await ensurePrices(true);
  const [{ priced, missing }, byAction] = await Promise.all([listModelPrices(), econByAction(bounds(parseRange({ r: "30" }, ["30"], "30")), null)]);
  const groups = new Map<string, PriceKey[]>();
  for (const k of Object.keys(DEFAULT_PRICES) as PriceKey[]) { const g = PRICE_LABELS[k][1]; groups.set(g, [...(groups.get(g) ?? []), k]); }
  const modelForm = (m: { model: string; inM: string; outM: string; image: string; call: string; note?: string }, isNew = false) => (
    <Form key={m.model || "new"} action={saveModelPriceAction} submit="Сохранить" variant="ghost" className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto]">
      <label className="text-xs text-ink2">Модель (как в шлюзе)<input name="model" required defaultValue={m.model} readOnly={!isNew && !!m.model} placeholder="например gpt-4o-mini" className={`${inp} mt-1`} /></label>
      <label className="text-xs text-ink2">Вход, ₽ за 1 млн<input name="inM" inputMode="decimal" defaultValue={m.inM} className={`${inp} mt-1`} /></label>
      <label className="text-xs text-ink2">Выход, ₽ за 1 млн<input name="outM" inputMode="decimal" defaultValue={m.outM} className={`${inp} mt-1`} /></label>
      <label className="text-xs text-ink2">Картинка, ₽ за шт.<input name="image" inputMode="decimal" defaultValue={m.image} className={`${inp} mt-1`} /></label>
      <label className="text-xs text-ink2">За вызов, ₽<input name="call" inputMode="decimal" defaultValue={m.call} className={`${inp} mt-1`} /></label>
    </Form>
  );
  return (
    <>
      <PageHead title="Цены" sub="Сколько клиент платит за действие и сколько нам стоит модель. Изменённые цены сразу действуют везде: в кнопках, подсказках и списаниях." />
      <AdminNav active="/app/admin/prices" />

      <ActionTable rows={byAction} title="Что сейчас происходит: выручка и затраты по действиям за 30 дней (ориентир для цен)" />

      <section className="card mb-6 p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2"><b className="text-sm">Цены списания, ₽</b>
          <form action={resetPricesAction} className="ml-auto"><SubmitButton data-confirm="Вернуть все цены к значениям по умолчанию?" className="btn btn-ghost !py-1.5 text-xs">Сбросить к умолчанию</SubmitButton></form></div>
        <p className="mb-4 text-xs text-ink2">Цена списывается за одну операцию. Рядом — значение по умолчанию. Выделенные поля изменены вами. Новая цена начинает действовать в течение 10 секунд на всех страницах и в воркере.</p>
        <Form action={savePricesAction} submit="Сохранить цены" className="space-y-5">
          {[...groups].map(([g, keys]) => (
            <div key={g}><b className="mb-2 block text-xs font-semibold text-ink2">{g}</b>
              <div className="grid gap-3 sm:grid-cols-2">{keys.map((k) => { const changed = PRICES[k] !== DEFAULT_PRICES[k]; return (
                <label key={k} className="block text-sm"><span className="flex items-center justify-between gap-2"><span>{PRICE_LABELS[k][0]}</span><span className="text-xs text-ink3">по умолч. {r2(DEFAULT_PRICES[k])} ₽</span></span>
                  <input name={`p_${k}`} inputMode="decimal" defaultValue={r2(PRICES[k])} className={`${inp} mt-1 ${changed ? "!bg-accent-soft ring-1 ring-accent" : ""}`} /></label>); })}</div></div>))}
        </Form>
      </section>

      <section className="card mb-6 p-5">
        <b className="mb-1 block text-sm">Себестоимость моделей (прайс AI Gateway Timeweb)</b>
        <p className="mb-4 text-xs text-ink2">Впишите, сколько нам стоит модель по прайсу Timeweb: рубли за 1 млн входных и выходных токенов, за картинку или за вызов. По этому прайсу считаются «Затраты» во всех отчётах, и при сохранении уже записанные вызовы модели пересчитываются. Для озвучки «токены» — знаки текста.</p>
        <div className="mb-5 grid gap-3 rounded-2xl bg-tile p-4 lg:grid-cols-2">
          <div><b className="mb-1 block text-xs font-semibold text-ink2">Подтянуть модели из шлюза</b>
            <p className="mb-2 text-xs text-ink2">Читает список моделей вашего AI Gateway и добавляет их в прайс. Цены подставляются из прайса Timeweb (кабинет, 23.10.2026), если название однозначное; уже заполненные модели не трогаются.</p>
            <Form action={pullGatewayModelsAction} submit="Подтянуть модели из шлюза" variant="ghost"><span className="sr-only">Без параметров</span></Form></div>
          <div><b className="mb-1 block text-xs font-semibold text-ink2">Загрузить логи Timeweb (CSV)</b>
            <p className="mb-2 text-xs text-ink2">Кабинет → Cloud AI → Gateway → логи → выгрузка. Для моделей без цены ставки берутся из фактических списаний, плюс сверка: сколько списал Timeweb и сколько посчитали мы.</p>
            <Form action={importLogsAction} submit="Загрузить логи" variant="ghost"><input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-xs file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold" /></Form></div>
        </div>
        {missing.length > 0 && (
          <div className="mb-5 rounded-2xl bg-warn-soft p-3"><b className="mb-2 block text-xs text-warn">Эти модели уже вызывались, но цены у них нет (затраты считаются как 0):</b>
            <div className="space-y-2">{missing.map((m) => <div key={m.model}>{modelForm({ model: m.model, inM: "", outM: "", image: "", call: "" }, true)}<span className="text-[11px] text-ink3">вызовов: {Number(m.calls).toLocaleString("ru-RU")}</span></div>)}</div></div>
        )}
        <div className="space-y-3">
          {priced.map((m) => (
            <div key={m.model} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">{modelForm({ model: m.model, inM: r2(Number(m.in_per_m_kop)), outM: r2(Number(m.out_per_m_kop)), image: r2(Number(m.per_image_kop)), call: r2(Number(m.per_call_kop)) })}<span className="text-[11px] text-ink3">вызовов: {Number(m.calls).toLocaleString("ru-RU")}</span></div>
              <Form action={deleteModelPriceAction} submit="Удалить" variant="danger" className="pb-4"><input type="hidden" name="model" value={m.model} /></Form>
            </div>))}
        </div>
        <div className="mt-5 border-t border-line pt-4"><b className="mb-2 block text-xs font-semibold text-ink2">Добавить модель</b>{modelForm({ model: "", inM: "", outM: "", image: "", call: "" }, true)}</div>
      </section>
    </>
  );
}
