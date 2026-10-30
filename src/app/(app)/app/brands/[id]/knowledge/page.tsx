import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Link2, Sparkles, Trash2, PenLine } from "lucide-react";
import { requireCtx, canWrite } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { OrgTabs } from "@/components/shell/OrgTabs";
import { Field } from "@/components/Form";
import { AutoTextarea } from "@/components/AutoTextarea";
import { ModalButton } from "@/components/ui/ModalButton";
import { BrandSelect } from "@/components/BrandSelect";
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

  const btnLight = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-tile px-3.5 text-sm font-semibold text-ink transition hover:bg-tile2";
  const ro = !write;
  // поле-строка как в макете: подпись над полем, тонкая линия снизу; высота растёт по тексту
  const F = ({ label, name, v, long }: { label: string; name: string; v: string; long?: boolean }) => (
    <div className="border-b border-[var(--tile)] py-4"><label className="label">{label}</label><AutoTextarea name={name} rows={1} defaultValue={v} readOnly={ro} className="input resize-none" data-long={long ? "1" : undefined} /></div>
  );
  const Sec = ({ title, hint }: { title: string; hint: string }) => (
    <div className="mb-3 mt-12 flex flex-col gap-2.5"><h2 className="text-2xl font-medium leading-6 text-ink">{title}</h2><p className="text-base font-medium text-ink/60">{hint}</p></div>
  );
  const analyze = write && docs.length > 0 ? (
    <form action={analyzeAction} className="flex items-center gap-3">
      <input type="hidden" name="brand" value={id} />
      <label className="flex items-center gap-1.5 text-xs text-ink2 max-md:hidden"><input type="checkbox" name="force" />Разобрать всё заново</label>
      <SubmitButton className="btn-rect">Проанализировать<Sparkles size={15} /></SubmitButton>
    </form>
  ) : null;

  return (
    <>
      <OrgTabs action={analyze} />
      {err && <p className="mb-4 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</p>}
      {note && <p className="mb-4 rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{note}</p>}

      <div className="max-w-[749px]">
        <div className="border-b border-[var(--tile)] pb-4">
          <label className="label">База знаний бренда</label>
          <BrandSelect brands={brands} current={id} />
        </div>
        <div className="border-b border-[var(--tile)] py-4">
          <label className="label">{hasKb ? "База знаний подключена к заводам, автоленте, студии и ответам на комментарии" : "База знаний пока пуста"}</label>
          <input readOnly value={`Материалов: ${docs.length} из ${KB_LIMITS.docs}${pending ? `, ждут анализа: ${pending}` : ""}${kb?.analyzed_at ? ` · анализ: ${new Date(kb.analyzed_at).toLocaleString("ru-RU")}` : ""}`} className="input" />
        </div>
        {write && (
          <div className="flex flex-wrap gap-3 pb-2 pt-5">
            <ModalButton label="Вставить текст" title="Вставить текст" className={btnLight} icon={<PenLine size={14} />}>
              <form action={addTextDocAction} className="max-w-[520px] space-y-4">
                <input type="hidden" name="brand" value={id} />
                <p className="text-sm text-ink2">Лучший способ для обучения стилю: вставьте 5–15 своих лучших постов или статей целиком. Текст всегда читается полностью.</p>
                <Field label="Что это"><select name="kind" defaultValue="article" className="input">{kindOpts}</select></Field>
                <Field label="Название (необязательно)"><input name="title" maxLength={160} className="input" /></Field>
                <Field label="Текст"><textarea name="text" rows={9} required className="input" placeholder="Вставьте статью, пост, описание услуг, таблицу сравнения с конкурентами…" /></Field>
                <label className="flex items-center gap-1.5 text-sm text-ink2"><input type="checkbox" name="style" />Использовать как образец стиля письма (для «наших статей» включается само)</label>
                <SubmitButton className="btn-rect">Добавить</SubmitButton>
              </form>
            </ModalButton>
            <ModalButton label="Добавить по ссылкам" title="Добавить по ссылкам" className={btnLight} icon={<Link2 size={14} />}>
              <form action={addLinksAction} className="max-w-[520px] space-y-4">
                <input type="hidden" name="brand" value={id} />
                <p className="text-sm text-ink2">Удобно, когда статей много: система сама откроет страницы и сохранит текст. Сайты на скриптах или закрытые страницы могут не открыться — тогда вставьте текст вручную.</p>
                <Field label="Что это"><select name="kind" defaultValue="article" className="input">{kindOpts}</select></Field>
                <Field label="Ссылки (по одной в строке, до 10)"><textarea name="links" rows={5} required className="input" placeholder="https://…" /></Field>
                <SubmitButton className="btn-rect">Загрузить по ссылкам</SubmitButton>
              </form>
            </ModalButton>
            <ModalButton label="Загрузить документы" title="Загрузить документы" className={btnLight} icon={<FileText size={14} />}>
              <div className="max-w-[520px]"><KbUploader brandId={id} /></div>
            </ModalButton>
          </div>
        )}
        {write && <p className="pt-2 text-xs text-ink3">Стоимость: разбор материала {rub(PRICES.kbDigest)}, сведение профиля {rub(PRICES.kbMerge)}, разбор стиля {rub(PRICES.kbStyle)}. Анализ запускается только по кнопке и не повторяется для уже разобранных материалов.</p>}

        {docs.length > 0 && (
          <>
            <Sec title="Материалы" hint="Всё, что вы добавили: по этим материалам строится профиль компании и манера письма." />
            <ul>
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--tile)] py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-ink">{d.title}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-ink/70">
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
                        <SubmitButton data-confirm="Удалить документ из базы знаний? Бренд перестанет учитывать его при создании материалов." className="grid size-10 place-items-center rounded-2xl text-ink/60 hover:text-bad" aria-label="Удалить материал"><Trash2 size={18} /></SubmitButton></form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {(kb || write) && (
          <>
            <form action={saveProfileAction}>
              <input type="hidden" name="brand" value={id} />
              <Sec title="Что мы за компания" hint="Результат анализа. Можно править: в списках одна запись в строке, пары пишутся через « | »." />
              <F label="О компании" name="about" v={p.about} />
              <F label="Миссия" name="mission" v={p.mission} />
              <F label="Продукты и услуги (название | описание)" name="products" v={p.products} />
              <F label="Аудитория (сегмент | потребности)" name="audience" v={p.audience} />
              <F label="Уникальные предложения" name="usp" v={p.usp} />
              <F label="Чем мы лучше" name="advantages" v={p.advantages} />
              <F label="Конкуренты (название | слабое место | наше отличие)" name="competitors" v={p.competitors} />
              <F label="Факты и доказательства: цифры, кейсы, награды" name="proof" v={p.proof} />
              <F label="Возражения клиентов (возражение | ответ)" name="objections" v={p.objections} />
              <F label="Частые вопросы (вопрос | ответ)" name="faq" v={p.faq} />
              <F label="Термины (как называем | что значит)" name="terms" v={p.terms} />
              <F label="Нельзя утверждать" name="avoid" v={p.avoid} />
              {write && <div className="pt-5"><SubmitButton className="btn-rect">Сохранить</SubmitButton></div>}
            </form>

            <form action={saveStyleAction}>
              <input type="hidden" name="brand" value={id} />
              <Sec title="Как мы пишем" hint="Заполняется по материалам, помеченным «Образец стиля». Правки сохраняются и учитываются в каждом тексте." />
              <F label="Голос и характер" name="voice" v={st.voice} />
              <F label="Обращение к читателю" name="person" v={st.person} />
              <F label="Фразы, абзацы, ритм" name="sentence" v={st.sentence} />
              <F label="Оформление" name="formatting" v={st.formatting} />
              <F label="Структура текстов (по шагам)" name="structure" v={st.structure} />
              <F label="Типичные начала" name="openings" v={st.openings} />
              <F label="Типичные концовки" name="closings" v={st.closings} />
              <F label="Любимые слова и обороты (через запятую)" name="like" v={st.like} />
              <F label="Избегаем (через запятую)" name="dislike" v={st.dislike} />
              <F label="Правила письма" name="rules" v={st.rules} />
              <F label="Характерные фрагменты (через пустую строку)" name="samples" v={st.samples} />
              {write && <div className="pt-5"><SubmitButton className="btn-rect">Сохранить</SubmitButton></div>}
            </form>
            {write && hasKb && (
              <>
                <Sec title="Проверить стиль" hint="Пробный текст в вашей манере письма: так видно, насколько хорошо разобран стиль." />
                <StyleTest brandId={id} price={rub(PRICES.kbTest)} />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
