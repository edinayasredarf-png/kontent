"use client";
import { Printer } from "lucide-react";

/** «Сохранить как PDF»: открывает печать браузера, где выбирается «Сохранить как PDF». Серверная генерация PDF не нужна. */
export function PrintButton({ label = "Сохранить как PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn btn-ghost no-print"><Printer size={15} />{label}</button>;
}
