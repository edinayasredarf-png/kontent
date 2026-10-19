"use client";
import { useEffect } from "react";

/**
 * Единый вид выпадающих списков и выбора даты во всём проекте. Нативные <select> и <input type="date"> остаются в разметке
 * (формы, доступность и состояние React не меняются), а вместо системного окна по нажатию открывается наше: список с подсветкой
 * выбранного и календарь с месяцами. Выбор записывается в сам элемент и сообщается событиями input/change.
 * Чтобы оставить системное окно у конкретного поля, добавьте ему атрибут data-native.
 */
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const CHECK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';
const ARROW = (d: "l" | "r") => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d === "l" ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"}"/></svg>`;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function setValue(el: HTMLSelectElement | HTMLInputElement, v: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function UiEnhancer() {
  useEffect(() => {
    let layer: HTMLDivElement | null = null, owner: HTMLElement | null = null, active = -1, cleanup: (() => void) | null = null;

    const close = () => { cleanup?.(); cleanup = null; layer?.remove(); layer = null; owner = null; active = -1; };
    const place = (el: HTMLElement, box: HTMLElement) => {
      const r = el.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
      box.style.minWidth = `${Math.max(r.width, box.dataset.cal ? 292 : 0)}px`;
      const h = box.offsetHeight, below = vh - r.bottom - 12, above = r.top - 12;
      const up = h > below && above > below;
      box.style.maxHeight = `${Math.max(160, Math.min(box.dataset.cal ? 520 : 340, up ? above : below))}px`;
      const hh = Math.min(box.offsetHeight, parseFloat(box.style.maxHeight));
      box.style.top = `${up ? Math.max(8, r.top - hh - 6) : r.bottom + 6}px`;
      box.style.left = `${Math.max(8, Math.min(r.left, vw - box.offsetWidth - 8))}px`;
    };
    const mount = (el: HTMLElement, box: HTMLElement, onKey?: (e: KeyboardEvent) => void) => {
      close(); owner = el; layer = document.createElement("div"); layer.className = "ui-layer"; layer.appendChild(box); document.body.appendChild(layer);
      place(el, box);
      const down = (e: MouseEvent) => { const t = e.target as Node; if (!box.contains(t) && !el.contains(t)) close(); };
      const t0 = Date.now(); const scroll = (e: Event) => { if (Date.now() - t0 > 250 && !box.contains(e.target as Node)) close(); };
      const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); const o = owner; close(); o?.focus({ preventScroll: true }); return; } onKey?.(e); };
      document.addEventListener("mousedown", down, true); window.addEventListener("scroll", scroll, true); window.addEventListener("resize", close); window.addEventListener("keydown", key, true);
      cleanup = () => { document.removeEventListener("mousedown", down, true); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", close); window.removeEventListener("keydown", key, true); };
    };

    const openSelect = (sel: HTMLSelectElement) => {
      if (owner === sel) { close(); return; }
      const box = document.createElement("div"); box.className = "ui-menu"; box.setAttribute("role", "listbox");
      const items: { el: HTMLElement; i: number }[] = [];
      const add = (o: HTMLOptionElement, host: HTMLElement) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "ui-menu-item"; b.setAttribute("role", "option");
        const on = o.index === sel.selectedIndex; if (on) b.dataset.on = "1";
        b.disabled = o.disabled; b.innerHTML = `<span class="ui-menu-label">${esc(o.text)}</span>${on ? `<span class="ui-menu-check">${CHECK}</span>` : ""}`;
        b.addEventListener("click", () => { const v = o.value; close(); sel.focus({ preventScroll: true }); if (sel.value !== v) setValue(sel, v); });
        host.appendChild(b); if (!o.disabled) items.push({ el: b, i: o.index });
      };
      for (const ch of Array.from(sel.children)) {
        if (ch instanceof HTMLOptGroupElement) { const g = document.createElement("div"); g.className = "ui-menu-group"; g.textContent = ch.label; box.appendChild(g); for (const o of Array.from(ch.children) as HTMLOptionElement[]) add(o, box); }
        else if (ch instanceof HTMLOptionElement) add(ch, box);
      }
      active = Math.max(0, items.findIndex((x) => x.i === sel.selectedIndex));
      const mark = () => items.forEach((x, k) => x.el.classList.toggle("is-active", k === active));
      mount(sel, box, (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); mark(); items[active]?.el.scrollIntoView({ block: "nearest" }); }
        else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); mark(); items[active]?.el.scrollIntoView({ block: "nearest" }); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); items[active]?.el.click(); }
        else if (e.key === "Tab") close();
      });
      mark(); box.querySelector<HTMLElement>("[data-on]")?.scrollIntoView({ block: "nearest" });
    };

    const openDate = (inp: HTMLInputElement) => {
      if (owner === inp) { close(); return; }
      const cur = /^\d{4}-\d{2}-\d{2}$/.test(inp.value) ? new Date(inp.value + "T00:00:00") : null;
      let view = new Date((cur ?? new Date()).getFullYear(), (cur ?? new Date()).getMonth(), 1);
      const box = document.createElement("div"); box.className = "ui-cal"; box.dataset.cal = "1";
      const render = () => {
        const sel = /^\d{4}-\d{2}-\d{2}$/.test(inp.value) ? inp.value : "", today = ymd(new Date());
        const first = new Date(view), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
        const min = inp.min, max = inp.max;
        let cells = "";
        for (let i = 0; i < 42; i++) {
          const d = new Date(start); d.setDate(start.getDate() + i); const k = ymd(d), out = d.getMonth() !== view.getMonth(), off = (min && k < min) || (max && k > max);
          cells += `<button type="button" class="ui-day${out ? " is-out" : ""}${k === sel ? " is-sel" : ""}${k === today ? " is-today" : ""}" data-d="${k}"${off ? " disabled" : ""}>${d.getDate()}</button>`;
        }
        box.innerHTML = `<div class="ui-cal-head"><button type="button" class="ui-cal-nav" data-nav="-1" aria-label="Предыдущий месяц">${ARROW("l")}</button><b>${MONTHS[view.getMonth()]} ${view.getFullYear()}</b><button type="button" class="ui-cal-nav" data-nav="1" aria-label="Следующий месяц">${ARROW("r")}</button></div>`
          + `<div class="ui-cal-week">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => `<span>${w}</span>`).join("")}</div><div class="ui-cal-grid">${cells}</div>`
          + `<div class="ui-cal-foot"><button type="button" class="ui-cal-link" data-today="1">Сегодня</button>${inp.required ? "" : `<button type="button" class="ui-cal-link" data-clear="1">Очистить</button>`}</div>`;
      };
      render();
      box.addEventListener("click", (e) => {
        const t = (e.target as HTMLElement).closest("button"); if (!t) return;
        if (t.dataset.nav) { view = new Date(view.getFullYear(), view.getMonth() + Number(t.dataset.nav), 1); render(); place(inp, box); }
        else if (t.dataset.d) { close(); inp.focus({ preventScroll: true }); setValue(inp, t.dataset.d); }
        else if (t.dataset.today) { close(); inp.focus({ preventScroll: true }); setValue(inp, ymd(new Date())); }
        else if (t.dataset.clear) { close(); inp.focus({ preventScroll: true }); setValue(inp, ""); }
      });
      mount(inp, box);
    };

    const target = (e: Event) => (e.target as HTMLElement | null)?.closest?.("select, input[type=date]") as HTMLSelectElement | HTMLInputElement | null;
    const usable = (el: HTMLSelectElement | HTMLInputElement | null) => !!el && !el.disabled && !("readOnly" in el && el.readOnly) && el.dataset.native === undefined && !(el instanceof HTMLSelectElement && (el.multiple || el.size > 1));
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return; const el = target(e); if (!usable(el)) return;
      e.preventDefault(); el!.focus({ preventScroll: true }); el instanceof HTMLSelectElement ? openSelect(el) : openDate(el as HTMLInputElement);
    };
    const onKey = (e: KeyboardEvent) => {
      if (layer) return; const el = target(e); if (!usable(el)) return;
      if (el instanceof HTMLSelectElement && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") && !e.altKey) { e.preventDefault(); openSelect(el); }
      else if (el instanceof HTMLInputElement && ((e.key === "ArrowDown" && e.altKey) || e.key === "F4")) { e.preventDefault(); openDate(el); }
    };
    // системное окно даты открывается по click (в Chrome — по значку, в Firefox — по полю): гасим его, наше уже открыто по mousedown
    const onClick = (e: MouseEvent) => { const el = target(e); if (usable(el) && el instanceof HTMLInputElement) e.preventDefault(); };
    // подтверждение для кнопок с data-confirm (удаление и отзыв): вместо мгновенного действия спрашиваем в своём окне
    let bypass: HTMLElement | null = null, ask: HTMLDivElement | null = null;
    const closeAsk = () => { ask?.remove(); ask = null; };
    const onConfirm = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest?.("[data-confirm]") as HTMLButtonElement | null;
      if (!btn || btn.disabled) return;
      if (bypass === btn) { bypass = null; return; }
      e.preventDefault(); e.stopPropagation();
      closeAsk();
      const ok = btn.dataset.confirmOk || "Удалить";
      ask = document.createElement("div"); ask.className = "ui-confirm"; ask.setAttribute("role", "alertdialog"); ask.setAttribute("aria-modal", "true");
      const back = document.createElement("div"); back.className = "ui-confirm-back";
      const box = document.createElement("div"); box.className = "ui-confirm-box";
      const h = document.createElement("b"); h.textContent = "Вы уверены?";
      const p = document.createElement("p"); p.textContent = btn.dataset.confirm ?? "";
      const row = document.createElement("div"); row.className = "ui-confirm-row";
      const no = document.createElement("button"); no.type = "button"; no.className = "pill"; no.textContent = "Отмена";
      const yes = document.createElement("button"); yes.type = "button"; yes.className = "ui-confirm-yes"; yes.textContent = ok;
      row.append(no, yes); box.append(h, p, row); ask.append(back, box); document.body.appendChild(ask);
      no.focus();
      const off = () => { document.removeEventListener("keydown", key, true); closeAsk(); };
      const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); off(); btn.focus({ preventScroll: true }); } };
      document.addEventListener("keydown", key, true);
      back.addEventListener("click", off); no.addEventListener("click", off);
      yes.addEventListener("click", () => { off(); bypass = btn; btn.click(); });
    };
    document.addEventListener("click", onConfirm, true);
    document.addEventListener("mousedown", onDown, true); document.addEventListener("click", onClick, true); document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("click", onConfirm, true); closeAsk(); document.removeEventListener("mousedown", onDown, true); document.removeEventListener("click", onClick, true); document.removeEventListener("keydown", onKey, true); close(); };
  }, []);
  return null;
}
