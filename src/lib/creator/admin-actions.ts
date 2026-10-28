"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "../auth";
import { saveModels } from "./models";

/** Модели изображений для клиентов студии каруселей: одна на строку «id | Название | Подсказка | цена ₽ за слайд | text». */
export async function saveCreatorModelsAction(f: FormData) {
  const c = await requireCtx();
  if (!c.isAdmin) return;
  await saveModels(String(f.get("models") ?? "").slice(0, 4000));
  revalidatePath("/app/settings/ai");
  revalidatePath("/app/create/carousel");
}
