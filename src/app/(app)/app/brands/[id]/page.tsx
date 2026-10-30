import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Plus, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { requireCtx, canWrite } from "@/lib/auth";
import { one } from "@/lib/db";
import { listAssets, LIMITS } from "@/lib/assets";
import { cleanKit, SIZES, STYLES } from "@/lib/images";
import { Form, Field } from "@/components/Form";
import { ColorSlots } from "@/components/ColorSlots";
import { FontPicker } from "@/components/FontPicker";
import { AssetUploader } from "@/components/AssetUploader";
import { LogoPlacement } from "@/components/LogoPlacement";
import { deleteAssetAction, redescribeAssetAction, saveBrand } from "@/lib/actions";
import { OrgTabs } from "@/components/shell/OrgTabs";
import { ShareCard } from "@/components/ShareCard";
import { listLinks } from "@/lib/share";

import { SubmitButton } from "@/components/SubmitButton";
const TONES: Record<string, string> = { professional: "Профессиональный", friendly: "Дружелюбный", humor: "Юмористический", serious: "Серьёзный", inspiring: "Вдохновляющий" };
const ASPECT: Record<string, string> = { square: "Квадрат 1:1", portrait: "Вертикальный 2:3", landscape: "Горизонтальный 3:2" };

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
  
  return (
    <>
      <OrgTabs action={canEdit ? <Link href="/app/brands/new" className="btn-rect">Добавить бренд<Plus size={16} /></Link> : null} />
      <h1 className="mb-2 text-4xl font-semibold leading-8 text-ink max-md:text-[28px]">{b.name}</h1>
      <p className="mb-8 mt-3 max-w-2xl text-sm text-ink2">Профиль и брендбук: по ним пишутся тексты и рисуются картинки.</p>
      <div className="max-w-[780px]">
        <Form action={saveBrand} submit="Сохранить" className="space-y-0">
          <input type="hidden" name="id" value={id} /><input type="hidden" name="kit_present" value="1" />
          <Row label="Название"><input name="name" required defaultValue={b.name} className="input" /></Row>
          <Row label="Чем занимается компания"><input name="description" defaultValue={b.description} className="input" placeholder="Например, продаёт кофе" /></Row>
          <Row label="Целевая аудитория"><input name="audience" defaultValue={b.audience} className="input" placeholder="Например, все, кто любит кофе" /></Row>
          <Row label="Тон общения"><select name="tone" defaultValue={b.tone} className="input">{Object.entries(TONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Row>
          <Row label="Что нельзя упоминать (через запятую)"><input name="forbidden" defaultValue={(b.rules.forbidden ?? []).join(", ")} className="input" placeholder="Например, это лучший кофе, дешёвый кофе" /></Row>
          <Row label="Конкуренты (не упоминать)"><input name="competitors" defaultValue={(b.rules.competitors ?? []).join(", ")} className="input" /></Row>
          <Acc title="Фирменные цвета">
            <p className="mb-3 text-xs text-ink2">До 6 цветов: выберите пипеткой или впишите HEX-код (например #029CDA). Модель рисует картинки в этой палитре, а карусели оформляются в этих цветах.</p>
            <ColorSlots initial={kit.colors ?? []} />
          </Acc>
          <Acc title="Шрифты">
            <p className="mb-3 text-xs text-ink2">Шрифт слайдов каруселей и инфографики. Выберите из списка (все с кириллицей) или подключите любой шрифт из Google Fonts.</p>
            <FontPicker initial={kit.font ?? ""} />
            <div className="mt-3"><label className="label">Заметка о шрифтах для команды (необязательно)</label><input name="fonts" defaultValue={kit.fonts} className="input" placeholder="Заголовки Montserrat, текст Inter" /></div>
          </Acc>
          <Row label="Стиль изображений"><select name="style" defaultValue={kit.style ?? ""} className="input"><option value="">Не задан</option>{Object.entries(STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Row>
          <Row label="Свой стиль словами"><input name="styleNotes" defaultValue={kit.styleNotes} className="input" placeholder="Тёплый свет, живые люди, городская среда, без стока" /></Row>
          <Row label="Всегда на картинках"><input name="imageMust" defaultValue={kit.imageMust} className="input" placeholder="Например, светлые, чистые фотографии интерьеров кафе" /></Row>
          <Row label="Никогда на картинках"><input name="imageNever" defaultValue={kit.imageNever} className="input" placeholder="Например, тёмные, грязные или перегруженные изображения" /></Row>
          <Acc title="Форматы изображений">
            <select name="aspect" defaultValue={kit.aspect} className="input">{Object.keys(SIZES).map((k) => <option key={k} value={k}>{ASPECT[k]}</option>)}</select>
          </Acc>
          <div className="pt-5"><span className="text-xs text-ink3">Логотип, фото и референсы загружаются ниже, они сохраняются сразу.</span></div>
        </Form>
        <div className="mt-2">
          <Acc title="Логотип">
            <p className="mb-3 text-xs text-ink2">PNG с прозрачным фоном. Накладывается на готовую картинку, а не рисуется нейросетью — так буквы не искажаются.</p>
            {logo && (
              <div className="mb-3 flex items-center gap-3">
                <div className="grid size-20 place-items-center rounded-xl border border-line bg-[repeating-conic-gradient(#f1f2f4_0_25%,#fff_0_50%)] bg-[length:12px_12px] p-1">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/assets/${logo.id}`} alt="Логотип" className="max-h-full max-w-full object-contain" /></div>
                {canEdit && <form action={deleteAssetAction}><input type="hidden" name="id" value={logo.id} /><SubmitButton data-confirm="Удалить файл из брендбука? Вернуть его будет нельзя." className="text-ink3 hover:text-bad" title="Удалить"><Trash2 size={16} /></SubmitButton></form>}
              </div>
            )}
            <AssetUploader brandId={id} kind="logo" label={logo ? "Заменить логотип" : "Загрузить логотип"} disabled={!canEdit} />
            {logo ? <LogoPlacement brandId={id} logoUrl={`/api/assets/${logo.id}`} aspect={kit.aspect ?? "square"} initial={{ pos: kit.logoPos ?? "br", scale: kit.logoScale ?? 14, margin: kit.logoMargin ?? 4 }} disabled={!canEdit} /> : <p className="mt-3 text-xs text-ink3">Загрузите логотип, и здесь можно будет выбрать, где и каким размером он накладывается.</p>}
          </Acc>
          <Gallery title="Фото продукта" hint="Модель опишет товар и будет держать его внешний вид в картинках." items={products} brandId={id} kind="product" max={LIMITS.product} canEdit={canEdit} />
          <Gallery title="Референсы стиля" hint="Примеры картинок, на которые нужно быть похожими. Из них берётся палитра, свет, композиция." items={refs} brandId={id} kind="reference" max={LIMITS.reference} canEdit={canEdit} />
        </div>
        <div className="mt-10">
          <ShareCard brandId={id} links={await listLinks(c.org.id, id)} canEdit={canEdit} wl={(await one<{ name: string; footer: string; hide: boolean }>("select wl_name as name, wl_footer as footer, wl_hide as hide from kz_orgs where id=$1", [c.org.id])) ?? { name: "", footer: "", hide: false }} />
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="border-b border-line py-4"><label className="label">{label}</label>{children}</div>;
}
function Acc({ title, children, count }: { title: string; children: React.ReactNode; count?: string }) {
  return (
    <details className="group border-b border-line">
      <summary className="flex h-14 cursor-pointer list-none items-center justify-between text-base font-medium [&::-webkit-details-marker]:hidden"><span>{title}{count && <span className="ml-2 text-xs font-normal text-ink3">{count}</span>}</span><ChevronRight size={20} className="text-ink2 transition-transform group-open:rotate-90" /></summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}

function Gallery({ title, hint, items, brandId, kind, max, canEdit }: { title: string; hint: string; items: { id: string; name: string; note: string }[]; brandId: string; kind: "product" | "reference"; max: number; canEdit: boolean }) {
  return (
    <Acc title={title} count={`${items.length}/${max}`}>
      <p className="mb-3 text-xs text-ink2">{hint}</p>
      {items.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {items.map((a) => (
            <div key={a.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/assets/${a.id}`} alt={a.name} title={a.note || "Описание не получено"} className="aspect-square w-full rounded-xl border border-line object-cover" />
              {!a.note && <span className="absolute left-1 top-1 rounded-md bg-warn-soft p-0.5 text-warn" title="Описание не получено"><AlertTriangle size={12} /></span>}
              {canEdit && (
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  {!a.note && <form action={redescribeAssetAction}><input type="hidden" name="id" value={a.id} /><SubmitButton className="rounded-md bg-surface/90 p-1 text-ink2 shadow" title="Описать заново"><RefreshCw size={12} /></SubmitButton></form>}
                  <form action={deleteAssetAction}><input type="hidden" name="id" value={a.id} /><SubmitButton data-confirm="Удалить файл из брендбука? Вернуть его будет нельзя." className="rounded-md bg-surface/90 p-1 text-bad shadow" title="Удалить"><Trash2 size={12} /></SubmitButton></form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <AssetUploader brandId={brandId} kind={kind} label="Загрузить" multiple disabled={!canEdit || items.length >= max} />
    </Acc>
  );
}
