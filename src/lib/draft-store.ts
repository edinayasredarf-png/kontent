import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Несохранённый ввод в localStorage: что человек набрал, не должно пропадать от перезагрузки страницы, перехода или закрытия вкладки.
 * Записи живут 7 дней. Недоступное хранилище (приватный режим, запрет) просто ничего не запоминает.
 */
const PREFIX = "lt_draft:", TTL = 7 * 24 * 3600_000;
interface Rec { v: unknown; base?: string; t: number }

function read(key: string): Rec | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const r = JSON.parse(raw) as Rec;
    if (!r || Date.now() - r.t > TTL) { localStorage.removeItem(PREFIX + key); return null; }
    return r;
  } catch { return null; }
}
function write(key: string, v: unknown, base?: string) { try { localStorage.setItem(PREFIX + key, JSON.stringify({ v, base, t: Date.now() })); } catch { /* ок */ } }
export function clearDraft(key: string) { try { localStorage.removeItem(PREFIX + key); } catch { /* ок */ } }

/** Чистит записи старше срока: вызывается раз при запуске оболочки кабинета. */
export function sweepDrafts() {
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith(PREFIX)) read(k.slice(PREFIX.length)); } } catch { /* ок */ }
}

/**
 * Значение, которое запоминается между перезагрузками. Первый показ — начальное значение (чтобы разметка сервера и клиента совпала),
 * сразу после загрузки подставляется запомненное. Значение, равное начальному, не хранится.
 */
export function useStored<T extends string | number | boolean>(key: string, initial: T): [T, (v: T) => void, () => void] {
  const [val, setVal] = useState<T>(initial);
  const ready = useRef(false);
  useEffect(() => {
    const r = read(key);
    if (r && typeof r.v === typeof initial) setVal(r.v as T);
    ready.current = true;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback((v: T) => { setVal(v); if (!ready.current) return; if (v === initial || v === "") clearDraft(key); else write(key, v); }, [key, initial]);
  return [val, set, useCallback(() => clearDraft(key), [key])];
}

/**
 * Правка текста, который хранится на сервере: пока человек не нажал «Сохранить», его правка лежит в браузере.
 * Восстанавливается только если версия на сервере с тех пор не менялась (base), иначе новый текст не затирается старой правкой.
 * Возвращает restore() — вернуть запомненное (или null) и remember(текст) — запомнить.
 */
export function useServerDraft(key: string, initial: string) {
  const [restored, setRestored] = useState<string | null>(null);
  useEffect(() => {
    const r = read(key);
    if (r && typeof r.v === "string" && r.base === initial && r.v !== initial) setRestored(r.v);
    else if (r) clearDraft(key);
  }, [key, initial]);
  const remember = useCallback((text: string) => { if (text === initial) clearDraft(key); else write(key, text, initial); }, [key, initial]);
  return { restored, remember, hide: () => setRestored(null), drop: () => { setRestored(null); clearDraft(key); } };
}
