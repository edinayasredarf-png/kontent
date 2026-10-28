"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "../auth";
import { saveModels } from "./models";
import { saveExamples } from "./examples";

/** Модели изображений для клиентов студии: одна на строку «id | Название | Подсказка | цена ₽ за слайд | text». */
export async function saveCreatorModelsAction(f: FormData) {
  const c = await requireCtx();
  if (!c.isAdmin) return;
  await saveModels(String(f.get("models") ?? "").slice(0, 4000));
  revalidatePath("/app/settings/ai");
  revalidatePath("/app/create");
}

/** Примеры для галереи: «формат | подпись | стиль (англ.) | структура | https-ссылка на картинку». Пусто — вернутся встроенные. */
export async function saveCreatorExamplesAction(f: FormData) {
  const c = await requireCtx();
  if (!c.isAdmin) return;
  await saveExamples(String(f.get("examples") ?? "").slice(0, 30000));
  revalidatePath("/app/settings/ai");
  revalidatePath("/app/create");
}
