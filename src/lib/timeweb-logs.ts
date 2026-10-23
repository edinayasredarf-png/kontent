import { q } from "./db";
import { audit } from "./admin";
import { resetModelPrices } from "./billing";

/** Выгрузка логов AI Gateway из кабинета Timeweb (CSV, разделитель «;»): по каждому запросу модель, токены и фактическая стоимость в рублях. */
export interface LogRow { at: Date | null; model: string; status: string; tin: number; tout: number; cin: number; cout: number; total: number; ok: boolean }
const num = (v: string | undefined) => { const n = Number((v ?? "").trim().replace(",", ".")); return Number.isFinite(n) ? n : 0; };

export function parseTimewebLogs(text: string): LogRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split(";").map((h) => h.trim());
  const col = (name: string) => head.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const idx = { at: col("Дата и время"), model: col("Модель запроса"), status: col("Причина завершения"), http: col("HTTP-код"), tin: col("Входящие токены"), tout: col("Исходящие токены"), cin: col("Стоимость входящих"), cout: col("Стоимость исходящих"), total: col("Итоговая стоимость") };
  if (idx.model < 0 || idx.total < 0) throw new Error("Это не похоже на выгрузку логов Timeweb: нет столбцов «Модель запроса» и «Итоговая стоимость»");
  return lines.slice(1).map((l) => {
    const c = l.split(";");
    const m = (c[idx.at] ?? "").match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    return {
      at: m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+03:00`) : null, model: (c[idx.model] ?? "").trim(), status: (c[idx.status] ?? "").trim(),
      tin: num(c[idx.tin]), tout: num(c[idx.tout]), cin: num(c[idx.cin]), cout: num(c[idx.cout]), total: num(c[idx.total]), ok: (c[idx.http] ?? "").trim() === "200",
    };
  }).filter((r) => r.model);
}

export interface ModelLog { model: string; calls: number; failed: number; tin: number; tout: number; cost: number; rateIn: number; rateOut: number; ours: number | null }

/** Свод по моделям: что реально списал Timeweb и какие ставки за 1 млн токенов из этого следуют. Ставка входа считается только по запросам с входом и т. д. */
export function summarizeLogs(rows: LogRow[]): ModelLog[] {
  const by = new Map<string, ModelLog & { cin: number; cout: number }>();
  for (const r of rows) {
    const m = by.get(r.model) ?? { model: r.model, calls: 0, failed: 0, tin: 0, tout: 0, cost: 0, rateIn: 0, rateOut: 0, ours: null, cin: 0, cout: 0 };
    if (r.ok) { m.calls++; m.tin += r.tin; m.tout += r.tout; m.cin += r.cin; m.cout += r.cout; m.cost += r.total; } else m.failed++;
    by.set(r.model, m);
  }
  return [...by.values()].map(({ cin, cout, ...m }) => ({ ...m, rateIn: m.tin ? (cin / m.tin) * 1e6 : 0, rateOut: m.tout ? (cout / m.tout) * 1e6 : 0 })).sort((a, b) => b.cost - a.cost);
}

type Actor = { id: string; email: string };
export interface LogImport { rows: number; from: string | null; to: string | null; total: number; ours: number; models: ModelLog[]; priced: string[] }

/** Загружает выгрузку: считает свод, для моделей без прайса вписывает ставки из логов и сверяет с тем, что посчитали мы. */
export async function importTimewebLogs(actor: Actor, text: string): Promise<LogImport> {
  const rows = parseTimewebLogs(text);
  if (!rows.length) throw new Error("В файле нет запросов");
  const models = summarizeLogs(rows);
  const times = rows.map((r) => r.at?.getTime()).filter((t): t is number => !!t);
  const from = times.length ? new Date(Math.min(...times)) : null, to = times.length ? new Date(Math.max(...times)) : null;
  const have = new Set((await q<{ model: string }>("select model from kz_ai_models where in_per_m_kop>0 or out_per_m_kop>0 or per_image_kop>0")).map((r) => r.model));
  const priced: string[] = [];
  for (const m of models) {
    if (!have.has(m.model) && (m.rateIn > 0 || m.rateOut > 0)) {
      await q(`insert into kz_ai_models(model,in_per_m_kop,out_per_m_kop,note) values($1,$2,$3,'по фактическим логам Timeweb') on conflict(model) do update set in_per_m_kop=excluded.in_per_m_kop,out_per_m_kop=excluded.out_per_m_kop,note=excluded.note,updated_at=now()`,
        [m.model, Math.round(m.rateIn * 100 * 100) / 100, Math.round(m.rateOut * 100 * 100) / 100]);
      priced.push(m.model);
    }
    if (from && to) {
      const o = await q<{ c: string }>("select coalesce(sum(cost_kop),0) c from kz_ai_usage where model=$1 and created_at >= $2 and created_at <= $3", [m.model, from.toISOString(), to.toISOString()]);
      m.ours = Number(o[0]?.c ?? 0) / 100; // в рублях, как и факт
    }
  }
  resetModelPrices();
  await audit(actor, "ai_logs.import", "ai_model", "logs", { rows: rows.length, priced });
  return { rows: rows.length, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, total: models.reduce((a, m) => a + m.cost, 0), ours: models.reduce((a, m) => a + (m.ours ?? 0), 0), models, priced };
}
