import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Link2, Sparkles, Trash2, PenLine } from "lucide-react";
import { requireCtx, canWrite } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { OrgTabs } from "@/components/shell/OrgTabs";
import { Field } from "@/components/Form";
import { SubmitButton } from "@/components/SubmitButton";
import { KbUploader } from "@/components/KbUploader";
import { StyleTest } from "@/components/StyleTest";
import { KB_KINDS } from "@/lib/kb/kinds";
import { KB_LIMITS } from "@/lib/kb/ingest";
import { loadKb } from "@/lib/kb/use";
import { profileToForm, styleToForm } from "@/lib/kb/edit";
import { emptyProfile, emptyStyle, profileIsEmpty, styleIsEmpty } from "@/lib/kb/types";
import { addLinksAction, addTextDocAction, analyzeAction, deleteDocAction, saveProfileAction, saveStyleAction, toggleStyleAction } from "@/lib/kb/actions";
import { PRICES, rub } from "@/lib/wallet";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface DocView { id: string; kind: keyof typeof KB_KINDS; title: string; url: string | null; chars: number; use_style: boolean; analyzed: boolean; digest_error: string | null }

export default async function Knowledge({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; note?: string }> }) {
  const { id } = await params;
  const { err, note } = await searchParams;
  const c = await requireCtx();
  const b = await one<{ id: string; name: string }>("select id,name from kz_brands where id=$1 and org_id=$2", [id, c.org.id]);
  if (!b) notFound();
  const brands = await q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by created_at", [c.org.id]);
  const write = canWrite(c.org.role);
  const [docs, kb] = await Promise.all([
    q<DocView>("select id,kind,title,url,chars,use_style,digest is not null analyzed,digest_error from kz_brand_docs where brand_id=$1 order by created_at desc", [id]),
    loadKb(c.org.id, id),
  ]);
  const pending = docs.filter((d) => !d.analyzed).length;
  const p = profileToForm(kb?.profile ?? emptyProfile());
  const st = styleToForm(kb?.style ?? emptyStyle());
  const hasKb = !!kb && (!profileIsEmpty(kb.profile) || !styleIsEmpty(kb.style));
  const kindOpts = Object.entries(KB_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>);
  const area = "input font-mono !text-[13px]";

  return (
    <>
      <OrgTabs />
      <div className="mb-8">
        <h1 className="text-4xl font-semibold leading-8 text-ink max-md:text-[28px]">База знаний</h1>
        <p className="mt-3 max-w-2xl text-sm text-ink2">Один раз загрузите статьи, документы и сравнения с конкурентами — нейросеть разберёт всё и будет опираться на это при каждом тексте.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {brands.map((x) => <Link key={x.id} href={`/app/brands/${x.id}/knowledge`} className={x.id === id ? "pill pill-on" : "pill"}>{x.name}</Link>)}
          <Link href={`/app/brands/${id}`} className="pill">Брендбук бренда →</Link>
        </div>
      </div>
      {err && <p className="mb-4 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</p>}
      {note && <p className="mb-4 rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{note}</p>}

      <div className="card mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{hasKb ? "База знаний подключена к заводам, автоленте, студии и ответам на комментарии" : "База знаний пока пуста"}</p>
            <p className="mt-1 text-xs text-ink2">
              Материалов: {docs.length} из {KB_LIMITS.docs}{pending ? `, ждут анализа: ${pending}` : ""}{kb?.analyzed_at ? ` · анализ: ${new Date(kb.analyzed_at).toLocaleString("ru-RU")}` : ""}
            </p>
          </div>
          {write && docs.length > 0 && (
            <form action={analyzeAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="brand" value={id} />
              <label className="flex items-center gap-1.5 text-xs text-ink2"><input type="checkbox" name="force" />Разобрать всё заново</label>
              <SubmitButton className="btn"><Sparkles size={15} />Проанализировать</SubmitButton>
            </form>
          )}
        </div>
        <p className="mt-3 text-xs text-ink2">
          Стоимость: разбор материала {rub(PRICES.kbDigest)}, сведение профиля {rub(PRICES.kbMerge)}, разбор стиля {rub(PRICES.kbStyle)}. Анализ запускается только по кнопке и не повторяется для уже разобранных материалов. Внимание: новый анализ пересобирает профиль из материалов — ручные правки профиля лучше вносить после него.
        </p>
      </div>

      {write && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <form action={addTextDocAction} className="card space-y-3 p-5">
            <input type="hidden" name="brand" value={id} />
            <h2 className="flex items-center gap-2 text-sm font-semibold"><PenLine size={15} />Вставить текст</h2>
            <p className="-mt-1 text-xs text-ink2">Лучший способ для обучения стилю: вставьте 5–15 своих лучших постов или статей целиком. Текст всегда читается полностью.</p>
            <Field label="Что это"><select name="kind" defaultValue="article" className="input">{kindOpts}</select></Field>
            <Field label="Название (необязательно)"><input name="title" maxLength={160} className="input" /></Field>
            <Field label="Текст"><textarea name="text" rows={7} required className="input" placeholder="Вставьте статью, пост, описание услуг, таблицу сравнения с конкурентами…" /></Field>
            <label className="flex items-center gap-1.5 text-xs text-ink2"><input type="checkbox" name="style" />Использовать как образец стиля письма (для «наших статей» включается само)</label>
            <SubmitButton className="btn">Добавить</SubmitButton>
          </form>

          <div className="space-y-6">
            <form action={addLinksAction} className="card space-y-3 p-5">
              <input type="hidden" name="brand" value={id} />
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Link2 size={15} />Добавить по ссылкам</h2>
              <p className="-mt-1 text-xs text-ink2">Удобно, когда статей много: система сама откроет страницы и сохранит текст. Сайты на скриптах или закрытые страницы могут не открыться — тогда вставьте текст вручную.</p>
              <Field label="Что это"><select name="kind" defaultValue="article" className="input">{kindOpts}</select></Field>
              <Field label="Ссылки (по одной в строке, до 10)"><textarea name="links" rows={4} required className="input" placeholder="https://…" /></Field>
              <SubmitButton className="btn">Загрузить по ссылкам</SubmitButton>
            </form>
            <div className="card space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><FileText size={15} />Загрузить документы</h2>
              <KbUploader brandId={id} />
            </div>
          </div>
        </div>
      )}

      <div className="card mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">Материалы</h2>
        {docs.length === 0 ? <p className="text-sm text-ink2">Пока ничего не добавлено.</p> : (
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink2">
                    <span>{KB_KINDS[d.kind] ?? d.kind}</span><span>{d.chars.toLocaleString("ru-RU")} зн.</span>
                    {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="truncate underline">{new URL(d.url).hostname}</a>}
                    {d.analyzed ? <span className="text-good">разобран</span> : d.digest_error ? <span className="text-bad">ошибка: {d.digest_error}</span> : <span>ждёт анализа</span>}
                  </p>
                </div>
                {write && (
                  <div className="flex items-center gap-2">
                    <form action={toggleStyleAction}><input type="hidden" name="brand" value={id} /><input type="hidden" name="id" value={d.id} />
                      <SubmitButton className={`chip cursor-pointer !px-3 !py-1.5 ${d.use_style ? "bg-accent-soft text-accent" : ""}`} title="Брать этот материал как образец стиля письма">{d.use_style ? "Образец стиля ✓" : "Образец стиля"}</SubmitButton></form>
                    <form action={deleteDocAction}><input type="hidden" name="brand" value={id} /><input type="hidden" name="id" value={d.id} />
                      <SubmitButton data-confirm="Удалить документ из базы знаний? Бренд перестанет учитывать его при создании материалов." className="btn btn-ghost !px-2.5 !py-1.5" aria-label="Удалить материал"><Trash2 size={14} /></SubmitButton></form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(kb || write) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form action={saveProfileAction} className="card space-y-3 p-5">
            <input type="hidden" name="brand" value={id} />
            <h2 className="text-sm font-semibold">Что мы за компания</h2>
            <p className="-mt-1 text-xs text-ink2">Результат анализа. Можно править: в списках одна запись в строке, пары пишутся через « | ».</p>
            <Field label="О компании"><textarea name="about" rows={3} defaultValue={p.about} className="input" /></Field>
            <Field label="Миссия"><input name="mission" defaultValue={p.mission} className="input" /></Field>
            <Field label="Продукты и услуги (название | описание)"><textarea name="products" rows={4} defaultValue={p.products} className={area} /></Field>
            <Field label="Аудитория (сегмент | потребности)"><textarea name="audience" rows={3} defaultValue={p.audience} className={area} /></Field>
            <Field label="Уникальные предложения"><textarea name="usp" rows={3} defaultValue={p.usp} className={area} /></Field>
            <Field label="Чем мы лучше"><textarea name="advantages" rows={4} defaultValue={p.advantages} className={area} /></Field>
            <Field label="Конкуренты (название | слабое место | наше отличие)"><textarea name="competitors" rows={4} defaultValue={p.competitors} className={area} /></Field>
            <Field label="Факты и доказательства: цифры, кейсы, награды"><textarea name="proof" rows={5} defaultValue={p.proof} className={area} /></Field>
            <Field label="Возражения клиентов (возражение | ответ)"><textarea name="objections" rows={3} defaultValue={p.objections} className={area} /></Field>
            <Field label="Частые вопросы (вопрос | ответ)"><textarea name="faq" rows={3} defaultValue={p.faq} className={area} /></Field>
            <Field label="Термины (как называем | что значит)"><textarea name="terms" rows={3} defaultValue={p.terms} className={area} /></Field>
            <Field label="Нельзя утверждать"><textarea name="avoid" rows={2} defaultValue={p.avoid} className={area} /></Field>
            {write && <SubmitButton className="btn">Сохранить профиль</SubmitButton>}
          </form>

          <div className="space-y-6">
            <form action={saveStyleAction} className="card space-y-3 p-5">
              <input type="hidden" name="brand" value={id} />
              <h2 className="text-sm font-semibold">Как мы пишем</h2>
              <p className="-mt-1 text-xs text-ink2">Заполняется по материалам, помеченным «Образец стиля». Правки сохраняются и учитываются в каждом тексте.</p>
              <Field label="Голос и характер"><textarea name="voice" rows={3} defaultValue={st.voice} className="input" /></Field>
              <Field label="Обращение к читателю"><input name="person" defaultValue={st.person} className="input" /></Field>
              <Field label="Фразы, абзацы, ритм"><textarea name="sentence" rows={2} defaultValue={st.sentence} className="input" /></Field>
              <Field label="Оформление"><textarea name="formatting" rows={2} defaultValue={st.formatting} className="input" /></Field>
              <Field label="Структура текстов (по шагам)"><textarea name="structure" rows={3} defaultValue={st.structure} className={area} /></Field>
              <Field label="Типичные начала"><textarea name="openings" rows={3} defaultValue={st.openings} className={area} /></Field>
              <Field label="Типичные концовки"><textarea name="closings" rows={3} defaultValue={st.closings} className={area} /></Field>
              <Field label="Любимые слова и обороты (через запятую)"><textarea name="like" rows={2} defaultValue={st.like} className="input" /></Field>
              <Field label="Избегаем (через запятую)"><textarea name="dislike" rows={2} defaultValue={st.dislike} className="input" /></Field>
              <Field label="Правила письма"><textarea name="rules" rows={4} defaultValue={st.rules} className={area} /></Field>
              <Field label="Характерные фрагменты (через пустую строку)"><textarea name="samples" rows={4} defaultValue={st.samples} className="input" /></Field>
              {write && <SubmitButton className="btn">Сохранить стиль</SubmitButton>}
            </form>
            {write && hasKb && (
              <div className="card space-y-3 p-5">
                <h2 className="text-sm font-semibold">Проверить стиль</h2>
                <StyleTest brandId={id} price={rub(PRICES.kbTest)} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
