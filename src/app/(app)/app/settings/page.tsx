import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { AI_TASKS, aiReady, listGatewayModels } from "@/lib/ai";
import { q } from "@/lib/db";
import { saveAiRoutes } from "@/lib/actions";
import { PageHead } from "@/components/ui";

export default async function Settings() {
  const c = await requireCtx();
  if (!c.isAdmin) redirect("/app");
  let models: string[] = [], err = "";
  if (aiReady()) { try { models = await listGatewayModels(); } catch (e) { err = (e as Error).message; } }
  else err = "Шлюз не настроен: задайте SELFHOSTED_LLM_URL и SELFHOSTED_LLM_API_KEY в окружении Vercel.";
  const saved = Object.fromEntries((await q<{ task: string; model: string }>("select task,model from kz_ai_routes")).map((r) => [r.task, r.model]));
  const fields = [{ key: "default", label: "Модель по умолчанию", hint: "Для всех задач ниже, где не выбрана своя" }, ...AI_TASKS];
  return (
    <>
      <PageHead title="Настройки ИИ" sub="Какая нейросеть AI Gateway Timeweb какую задачу выполняет. Действует для всех организаций платформы." />
      <div className={`mb-6 rounded-xl px-4 py-3 text-sm ${err ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>
        <div className="flex items-center gap-2">{err ? <XCircle size={16} /> : <CheckCircle2 size={16} />}{err ? "Каталог моделей недоступен" : `Шлюз подключён. Каталог: ${models.length} моделей — начните печатать, появятся подсказки.`}</div>
        {err && <p className="mt-1 text-xs">{err}. Id модели можно вписать вручную — это API id со страницы шлюза, а не отображаемое имя.</p>}
      </div>
      <datalist id="gateway-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
      <form action={saveAiRoutes} className="card max-w-2xl space-y-4 p-6">
        {fields.map((t) => (
          <div key={t.key}>
            <label className="label">{t.label} <span className="font-normal text-ink3">— {t.hint}</span></label>
            <input name={`route_${t.key}`} list="gateway-models" defaultValue={saved[t.key] ?? ""} autoComplete="off" spellCheck={false}
              placeholder={t.key === "default" ? "начните печатать id модели…" : "как у модели по умолчанию"} className="input" />
          </div>
        ))}
        <p className="text-xs text-ink3">Пустое поле — берётся модель по умолчанию, а если и она пуста — переменная SELFHOSTED_LLM_MODEL.</p>
        <button className="btn">Сохранить</button>
      </form>
    </>
  );
}
