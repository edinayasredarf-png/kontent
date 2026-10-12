import { Download, ExternalLink, Mail } from "lucide-react";
import { saveEmailMetaAction, sendTestEmailAction } from "@/lib/docs-actions";
import type { EmailMeta, GuideMeta } from "@/lib/docs";
import { CopyHtml } from "./CopyHtml";

import { SubmitButton } from "@/components/SubmitButton";
/** Рассылка и гайд: просмотр, скачивание, для письма — правка темы и кнопки и тестовая отправка себе. */
export function DocPanel({ itemId, factoryId, kind, email, guide, html, editable }: { itemId: string; factoryId: string; kind: "email" | "guide"; email: EmailMeta | null; guide: GuideMeta | null; html: string; editable: boolean }) {
  const view = `/api/export/${itemId}/doc`;
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm">{kind === "email" ? "Рассылка" : "Гайд"}</b>
        {kind === "email" && email && <span className="truncate text-xs text-ink2">Тема: {email.subject}</span>}
        {kind === "guide" && guide && <span className="truncate text-xs text-ink2">{guide.title}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <a href={view} target="_blank" rel="noreferrer noopener" className="btn btn-ghost !py-1.5"><ExternalLink size={14} />{kind === "email" ? "Просмотр" : "Открыть и сохранить как PDF"}</a>
          <a href={`${view}?as=file`} className="btn btn-ghost !py-1.5"><Download size={14} />Скачать HTML</a>
          {kind === "email" && <CopyHtml url={`${view}?as=file`} />}
        </div>
      </div>
      {kind === "email" && (
        <iframe title="Просмотр письма" src={view} sandbox="" className="h-96 w-full rounded-lg border border-line bg-white" loading="lazy" />
      )}
      {kind === "email" && email && editable && (
        <details className="rounded-xl bg-tile p-3">
          <summary className="cursor-pointer text-xs font-medium text-ink2">Изменить тему, заголовок и кнопку</summary>
          <form action={saveEmailMetaAction} className="mt-3 space-y-2">
            <input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} />
            <input name="subject" defaultValue={email.subject} maxLength={80} placeholder="Тема письма" className="input !bg-surface font-medium" />
            <input name="preheader" defaultValue={email.preheader} maxLength={120} placeholder="Прехедер" className="input !bg-surface" />
            <input name="headline" defaultValue={email.headline} maxLength={90} placeholder="Заголовок внутри письма" className="input !bg-surface" />
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="cta" defaultValue={email.cta} maxLength={40} placeholder="Текст кнопки" className="input !bg-surface" />
              <input name="ctaUrl" defaultValue={email.ctaUrl} placeholder="https://… ссылка кнопки" className="input !bg-surface" />
            </div>
            <SubmitButton className="btn btn-ghost !py-1.5">Сохранить</SubmitButton>
          </form>
        </details>
      )}
      {kind === "email" && (
        <form action={sendTestEmailAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} />
          <SubmitButton className="btn btn-ghost !py-1.5"><Mail size={14} />Отправить тест себе</SubmitButton>
          <span className="text-xs text-ink3">Подписчикам ничего не уходит: письмо скачайте и отправьте через свой сервис рассылок. В HTML есть подстановка {"{{unsubscribe_url}}"} для ссылки отписки.</span></form>
      )}
      {html === "" && <p className="text-xs text-warn">Текст пока пуст.</p>}
    </div>
  );
}
