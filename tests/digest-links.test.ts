import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("сводка трендов: ссылки на посты", () => {
  it("фильтр по одному посту игнорирует статус и период", async () => {
    const { feedWhere, parseFilter } = await import("../src/lib/monitor/feed-query");
    const id = "0833b852-dc68-4cbd-8b5f-0981742b5256";
    const f = parseFilter({ id, show: "new", d: "1" });
    assert.equal(f.id, id);
    const w = feedWhere("11111111-1111-1111-1111-111111111111", f);
    assert.ok(w.sql.includes("i.id=$3::uuid"), w.sql); assert.ok(!w.sql.includes("status"), w.sql); assert.equal(w.args[2], id);
    assert.equal(parseFilter({ id: "не-uuid" }).id, "");
  });

  it("«пост 12» и «посты 1, 7, 20» превращаются в ссылки, разметка не торчит", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import("../src/components/AiPanel");
    const links = [1, 7, 12, 20].map((n) => ({ n, title: `Пост ${n}`, source: "s", href: `/app/monitor?id=p${n}` }));
    const html = renderToStaticMarkup(React.createElement(mod.Formatted, { text: "# Анализ\n\n- **Цифровизация** — 3 упоминания (посты 1, 7, 20): форум\n- Зелёные насаждения (пост 12)", refs: links }));
    assert.ok(!html.includes("**") && !html.includes("# Анализ"), html);
    for (const n of [1, 7, 12, 20]) assert.ok(html.includes(`href="/app/monitor?id=p${n}"`), `нет ссылки на пост ${n}`);
    assert.ok(html.includes("<b") && html.includes("<h4"));
  });
});
