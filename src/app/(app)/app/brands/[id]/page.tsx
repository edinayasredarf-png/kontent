import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { requireCtx, canWrite } from "@/lib/auth";
import { one } from "@/lib/db";
import { listAssets, LIMITS } from "@/lib/assets";
import { cleanKit, SIZES, STYLES } from "@/lib/images";
import { Form, Field } from "@/components/Form";
import { AssetUploader } from "@/components/AssetUploader";
import { deleteAssetAction, redescribeAssetAction, saveBrand } from "@/lib/actions";
import { PageHead } from "@/components/ui";
import { ShareCard } from "@/components/ShareCard";
import { listLinks } from "@/lib/share";

const TONES: Record<string, string> = { professional: "Профессиональный", friendly: "Дружелюбный", humor: "Юмористический", serious: "Серьёзный", inspiring: "Вдохновляющий" };
const ASPECT: Record<string, string> = { square: "Квадрат 1:1", portrait: "Вертикальный 2:3", landscape: "Горизонтальный 3:2" };
const POS: Record<string, string> = { br: "Справа внизу", bl: "Слева внизу", tr: "Справа вверху", tl: "Слева вверху", none: "Не накладывать" };

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await requireCtx();
  const b = await one<{ id: string; name: string; description: string; audience: string; tone: string; rules: { forbidden?: string[]; competitors?: string[] }; kit: unknown }>(
    "select id,name,description,audience,tone,rules,kit from kz_brands where id=$1 and org_id=$2", [id, c.org.id]);
  if (!b) notFound();
  const kit = cleanKit(b.kit);
  const assets = await listAssets(c.org.id, id);
  const logo = assets.find((a) => a.kind === "logo");
  const products = assets.filter((a) => a.kind === "product"), refs = assets.filter((a) => a.kind === "reference");
  const canEdit = canWrite(c.org.role);
  const slots = Array.from({ length: 6 }, (_, i) => kit.colors?.[i] ?? null);

  return (
    <>
      <Link href="/app/brands" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Все бренды</Link>
      <PageHead title={b.name} sub="Профиль и брендбук: по ним пишутся тексты и рисуются картинки." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card p-6">
          <Form action={saveBrand} submit="Сохранить">
            <input type="hidden" name="id" value={id} /><input type="hidden" name="kit_present" value="1" />
            <h2 className="text-sm font-semibold">Профиль</h2>
            <Field label="Название"><input name="name" required defaultValue={b.name} className="input" /></Field>
            <Field label="Чем занимается компания"><textarea name="description" rows={4} defaultValue={b.description} className="input" /></Field>
            <Field label="Целевая аудитория"><textarea name="audience" rows={2} defaultValue={b.audience} className="input" /></Field>
            <Field label="Тон общения"><select name="tone" defaultValue={b.tone} className="input">{Object.entries(TONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Что нельзя упоминать (через запятую)"><input name="forbidden" defaultValue={(b.rules.forbidden ?? []).join(", ")} className="input" /></Field>
            <Field label="Конкуренты (не упоминать)"><input name="competitors" defaultValue={(b.rules.competitors ?? []).join(", ")} className="input" /></Field>

            <h2 className="border-t border-line pt-5 text-sm font-semibold">Фирменные цвета</h2>
            <p className="-mt-2 text-xs text-ink2">Включите нужные (до 6). Модель рисует картинки в этой палитре.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {slots.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl bg-tile p-2">
                  <input type="checkbox" name={`color_on_${i}`} defaultChecked={!!s} aria-label={`Цвет ${i + 1}`} />
                  <input type="color" name={`color_hex_${i}`} defaultValue={s?.hex ?? "#029cda"} className="size-9 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                  <input name={`color_name_${i}`} defaultValue={s?.name ?? ""} placeholder="Название (необязательно)" maxLength={30} className="input !bg-surface !py-1.5 text-xs" />
                </div>
              ))}
            </div>
            <Field label="Шрифты (для справки команде)"><input name="fonts" defaultValue={kit.fonts} className="input" placeholder="Inter, PT Serif" /></Field>

            <h2 className="border-t border-line pt-5 text-sm font-semibold">Стиль изображений</h2>
            <div className="flex flex-wrap gap-2">
              <label className="chip cursor-pointer !px-3 !py-1.5 has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink"><input type="radio" name="style" value="" defaultChecked={!kit.style} className="hidden" />Не задан</label>
              {Object.entries(STYLES).map(([k, v]) => (
                <label key={k} className="chip cursor-pointer !px-3 !py-1.5 has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink"><input type="radio" name="style" value={k} defaultChecked={kit.style === k} className="hidden" />{v.label}</label>
              ))}
            </div>
            <Field label="Свой стиль словами"><textarea name="styleNotes" rows={2} defaultValue={kit.styleNotes} className="input" placeholder="Тёплый свет, живые люди, городская среда, без стока" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Всегда на картинках"><input name="imageMust" defaultValue={kit.imageMust} className="input" placeholder="например: современный город" /></Field>
              <Field label="Никогда на картинках"><input name="imageNever" defaultValue={kit.imageNever} className="input" placeholder="например: люди в касках, текст" /></Field>
              <Field label="Формат"><select name="aspect" defaultValue={kit.aspect} className="input">{Object.keys(SIZES).map((k) => <option key={k} value={k}>{ASPECT[k]}</option>)}</select></Field>
              <Field label="Логотип на картинке"><select name="logoPos" defaultValue={kit.logoPos} className="input">{Object.entries(POS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label={`Размер логотипа: доля ширины, % (6–30)`}><input name="logoScale" type="number" min={6} max={30} defaultValue={kit.logoScale} className="input" /></Field>
            </div>
          </Form>
        </div>

        <div className="space-y-6">
          <ShareCard brandId={id} links={await listLinks(c.org.id, id)} canEdit={canEdit} />
          <section className="card p-5">
            <b className="text-sm">Логотип</b>
            <p className="mb-3 mt-1 text-xs text-ink2">PNG с прозрачным фоном. Накладывается на готовую картинку, а не рисуется нейросетью — так буквы не искажаются.</p>
            {logo && (
              <div className="mb-3 flex items-center gap-3">
                <div className="grid size-20 place-items-center rounded-xl border border-line bg-[repeating-conic-gradient(#f1f2f4_0_25%,#fff_0_50%)] bg-[length:12px_12px] p-1">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/assets/${logo.id}`} alt="Логотип" className="max-h-full max-w-full object-contain" /></div>
                {canEdit && <form action={deleteAssetAction}><input type="hidden" name="id" value={logo.id} /><button className="text-ink3 hover:text-bad" title="Удалить"><Trash2 size={16} /></button></form>}
              </div>
            )}
            <AssetUploader brandId={id} kind="logo" label={logo ? "Заменить логотип" : "Загрузить логотип"} disabled={!canEdit} />
          </section>
          <Gallery title="Фото продукта" hint="Модель опишет товар и будет держать его внешний вид в картинках." items={products} brandId={id} kind="product" max={LIMITS.product} canEdit={canEdit} />
          <Gallery title="Референсы стиля" hint="Примеры картинок, на которые нужно быть похожими. Из них берётся палитра, свет, композиция." items={refs} brandId={id} kind="reference" max={LIMITS.reference} canEdit={canEdit} />
        </div>
      </div>
    </>
  );
}

function Gallery({ title, hint, items, brandId, kind, max, canEdit }: { title: string; hint: string; items: { id: string; name: string; note: string }[]; brandId: string; kind: "product" | "reference"; max: number; canEdit: boolean }) {
  return (
    <section className="card p-5">
      <b className="text-sm">{title}</b> <span className="text-xs text-ink3">{items.length}/{max}</span>
      <p className="mb-3 mt-1 text-xs text-ink2">{hint}</p>
      {items.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {items.map((a) => (
            <div key={a.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/assets/${a.id}`} alt={a.name} title={a.note || "Описание не получено"} className="aspect-square w-full rounded-xl border border-line object-cover" />
              {!a.note && <span className="absolute left-1 top-1 rounded-md bg-warn-soft p-0.5 text-warn" title="Описание не получено"><AlertTriangle size={12} /></span>}
              {canEdit && (
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  {!a.note && <form action={redescribeAssetAction}><input type="hidden" name="id" value={a.id} /><button className="rounded-md bg-surface/90 p-1 text-ink2 shadow" title="Описать заново"><RefreshCw size={12} /></button></form>}
                  <form action={deleteAssetAction}><input type="hidden" name="id" value={a.id} /><button className="rounded-md bg-surface/90 p-1 text-bad shadow" title="Удалить"><Trash2 size={12} /></button></form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <AssetUploader brandId={brandId} kind={kind} label="Загрузить" multiple disabled={!canEdit || items.length >= max} />
    </section>
  );
}
