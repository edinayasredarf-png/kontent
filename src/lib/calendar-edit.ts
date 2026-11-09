import { calendarColor } from "./calendar";
export const CALENDAR_EDITABLE = ["idea", "approved", "ready", "failed", "rejected"];
export function validateCalendarEdit(topic: string, hook: string, body: string, color: string): string | null {
  if (topic.trim().length < 3 || topic.trim().length > 300) return "Тема должна содержать от 3 до 300 символов";
  if (hook.trim().length > 300) return "Хук должен быть не длиннее 300 символов";
  if (body.length > 200000) return "Текст слишком длинный: максимум 200 000 символов";
  if (color && !calendarColor(color)) return "Выберите цвет из палитры";
  return null;
}
