import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { AI_TASKS, aiReady, listGatewayModels, modelFor } from "@/lib/ai";
import { saveAiRoutes } from "@/lib/actions";
import { PageHead } from "@/components/ui";

export default async function Settings() {
  const c = await requireCtx();
  if (!c.isAdmin) redirect("/app");
  let models: string[] = [], err = "";
  if (aiReady()) { try { models = await listGatewayModels(); } catch (e) { err = (e as Error).message; } }
  else err = "Шлюз не настроен: задайте SELFHOSTED_LLM_URL и SELFHOSTED_LLM_API_KEY в окружении Vercel.";
  const current = Object.fromEntries(await Promise.all(AI_TASKS.map(async (t) => [t.key, await modelFor(t.key)])));
  return (
    <>
      <PageHead title="Настройки ИИ" sub="Какая нейросеть AI Gateway Timeweb какую задачу выполняет. Действует для всех организаций платформы." />
      <div className={`mb-6 flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${err ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>
        {err ? <XCircle size={16} /> : <CheckCircle2 size={16} />}{err || `Шлюз подключён, моделей в каталоге: ${models.length}`}
      </div>
      <form action={saveAiRoutes} className="card max-w-2xl space-y-4 p-6">
        {AI_TASKS.map((t) => (
          <div key={t.key}>
            <label className="label">{t.label} <span className="font-normal text-ink3">— {t.hint}</span></label>
            <select name={`route_${t.key}`} defaultValue={current[t.key] ?? ""} className="input">
              <option value="">По умолчанию (SELFHOSTED_LLM_MODEL)</option>
              {current[t.key] && !models.includes(current[t.key]) && <option value={current[t.key]}>{current[t.key]} (нет в каталоге)</option>}
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        ))}
        <button className="btn">Сохранить</button>
      </form>
    </>
  );
}
