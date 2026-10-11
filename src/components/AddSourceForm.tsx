"use client";
import { useState } from "react";
import { Form, Field } from "./Form";
import { addSourceAction } from "@/lib/monitor/actions";

/** Добавление источника мониторинга. Для MAX выбирается уже подключённый канал (токен бота берётся оттуда). */
export function AddSourceForm({ vkOn, maxChannels }: { vkOn: boolean; maxChannels: { id: string; title: string }[] }) {
  const [kind, setKind] = useState("site");
  return (
    <Form action={addSourceAction} submit="Проверить и добавить">
      <Field label="Тип">
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input">
          <option value="site">Сайт или RSS-лента</option><option value="telegram">Telegram-канал (публичный)</option>
          <option value="vk" disabled={!vkOn}>Сообщество VK{vkOn ? "" : " — нужен VK_SERVICE_TOKEN"}</option>
          <option value="max">MAX: свой канал (бот — администратор)</option><option value="news">Новости по запросу</option>
        </select>
      </Field>
      {kind === "max" ? (
        <Field label="Канал MAX">
          <select name="value" required className="input"><option value="">Выберите подключённый канал</option>{maxChannels.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        </Field>
      ) : (
        <Field label="Адрес, @канал или запрос"><input name="value" required className="input" placeholder="example.ru · @channel · vk.com/name · «закупки 44-ФЗ»" /></Field>
      )}
      {kind === "max" && (
        <p className="text-xs text-ink3">
          MAX отдаёт посты только тех каналов, где бот является администратором с правом «читать все сообщения»: это ваши каналы или каналы партнёров, которые добавили вашего бота. Читать чужие открытые каналы MAX нельзя. {maxChannels.length === 0 && "Сначала подключите канал MAX на странице «Каналы»."}
        </p>
      )}
      {kind !== "max" && <p className="text-xs text-ink3">Мы проверим, что источник читается. Сайты — через RSS, если её нет, берём заголовки с главной страницы.</p>}
    </Form>
  );
}
