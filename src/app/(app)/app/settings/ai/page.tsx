import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { AI_TASKS, aiReady, listGatewayModels } from "@/lib/ai";
import { q } from "@/lib/db";
import { saveAiRoutes } from "@/lib/actions";
import { saveCreatorExamplesAction, saveCreatorModelsAction } from "@/lib/creator/admin-actions";
import { examplesToText, listExamples } from "@/lib/creator/examples";
import { imageModels, modelsToText } from "@/lib/creator/models";
import { PageHead } from "@/components/ui";

import { SubmitButton } from "@/components/SubmitButton";
export default async function Settings() {
  const c = await requireCtx();
  if (!c.isAdmin) redirect("/app");
  let models: string[] = [], err = "";
  if (aiReady()) { try { models = await listGatewayModels(); } catch (e) { err = (e as Error).message; } }
  else err = "Шлюз не настроен: задайте SELFHOSTED_LLM_URL и SELFHOSTED_LLM_API_KEY в окружении Vercel.";
  const saved = Object.fromEntries((await q<{ task: string; model: string }>("select task,model from kz_ai_routes")).map((r) => [r.task, r.model]));
  const custom = await q("select 1 from kz_kv where key='creator_image_models'").then((r) => r.length > 0).catch(() => false);
  const catalog = modelsToText(await imageModels().catch(() => []));
  const examples = examplesToText(await listExamples().catch(() => []));
  const fields = [{ key: "default", label: "Модель по умолчанию", hint: "Для всех задач ниже, где не выбрана своя" }, ...AI_TASKS];
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHead title="Настройки ИИ" sub="Какая нейросеть AI Gateway Timeweb какую задачу выполняет. Действует для всех организаций платформы." />
      <div className={`mb-6 rounded-xl px-4 py-3 text-sm ${err ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>
        <div className="flex items-center gap-2">{err ? <XCircle size={16} /> : <CheckCircle2 size={16} />}{err ? "Каталог моделей недоступен" : `Шлюз подключён. Каталог: ${models.length} моделей — начните печатать, появятся подсказки.`}</div>
        {err && <p className="mt-1 text-xs">{err}. Id модели можно вписать вручную — это API id со страницы шлюза, а не отображаемое имя.</p>}
      </div>
      <datalist id="gateway-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
      <form action={saveAiRoutes} className="card space-y-4 p-6">
        {fields.map((t) => (
          <div key={t.key}>
            <label className="label">{t.label} <span className="font-normal text-ink3">— {t.hint}</span></label>
            <input name={`route_${t.key}`} list="gateway-models" defaultValue={saved[t.key] ?? ""} autoComplete="off" spellCheck={false}
              placeholder={t.key === "default" ? "начните печатать id модели…" : t.key === "image" || t.key === "video" ? "обязательно выберите модель" : "как у модели по умолчанию"} className="input" />
          </div>
        ))}
        <p className="text-xs text-ink3">Пустое поле — берётся модель по умолчанию, а если и она пуста — переменная SELFHOSTED_LLM_MODEL. Для изображений и видео общая модель не подходит: выбирайте их отдельно.</p>
        <SubmitButton className="btn">Сохранить</SubmitButton>
      </form>
      <form action={saveCreatorModelsAction} className="card mt-6 space-y-3 p-6">
        <div><b>Модели для клиентов (студия каруселей)</b><p className="mt-1 text-xs text-ink3">Клиент сам выбирает модель отрисовки слайдов и видит цену. Одна модель на строку: <code>id модели | Название | Подсказка | цена в ₽ за слайд в 1K | text</code>. Слово <code>text</code> в конце значит, что модель ровно рисует русский текст. Цена 2K и 4K считается от неё (×1,7 и ×2,7). {custom ? "" : "Сейчас список не задан: клиентам доступна одна модель из пункта «Генерация изображений»."}</p></div>
        <textarea name="models" rows={5} defaultValue={catalog} spellCheck={false} className="input font-mono text-xs" placeholder="gpt-image-1 | GPT Image | Ровный русский текст на слайде | 7 | text&#10;gemini-2.5-flash-image | Nano | Дешевле, текст может поплыть | 5" />
        <SubmitButton className="btn">Сохранить список</SubmitButton>
      </form>
      <form action={saveCreatorExamplesAction} className="card mt-6 space-y-3 p-6">
        <div><b>Примеры для клиентов (кнопка «Примеры» в создании)</b><p className="mt-1 text-xs text-ink3">Референсы, по которым ИИ повторит подачу на другую тему. По строке на пример: формат | подпись | стиль для художника (по-английски) | структура | https-ссылка на картинку (необязательно). Форматы: carousel, post, reels и другие. Если список пуст, показываются встроенные примеры.</p></div>
        <textarea name="examples" rows={8} defaultValue={examples} spellCheck={false} className="input font-mono text-xs" placeholder="carousel | Неон и космос | neon purple space, glowing gradients, 3D objects | список: 5 ошибок и как их исправить | https://…/cover.jpg" />
        <SubmitButton className="btn">Сохранить примеры</SubmitButton>
      </form>
    </div>
  );
}
