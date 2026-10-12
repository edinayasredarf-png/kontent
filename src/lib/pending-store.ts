"use client";
/** Счётчик «что-то выполняется»: кнопки отправки форм и переходы по ссылкам увеличивают его, пока ждут. По нему показываются полоса и подсказка. */
let count = 0;
let startedAt = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const pendingStore = {
  inc() { if (count === 0) startedAt = Date.now(); count++; emit(); },
  dec() { count = Math.max(0, count - 1); emit(); },
  reset() { count = 0; emit(); },
  get: () => count,
  startedAt: () => startedAt,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
