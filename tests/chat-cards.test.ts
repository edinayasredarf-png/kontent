import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Карточки в чате: ссылки на объекты от модели проверяются и ограничиваются. */
describe("ссылки на карточки", () => {
  it("известные типы и корректные id проходят, мусор отбрасывается", async () => {
    const { cleanRefs } = await import("../src/lib/agent/cards");
    const id = "11111111-1111-1111-1111-111111111111";
    const r = cleanRefs([
      { type: "news", ids: [id, "не-uuid", "22222222-2222-2222-2222-222222222222"] },
      { type: "factory", id }, { type: "factory", id: "bad" },
      { type: "analytics", days: 30 }, { type: "analytics", days: 5 },
      { type: "sources" }, { type: "hack", id }, null, "x",
    ]);
    assert.deepEqual(r, [
      { t: "news", ids: [id, "22222222-2222-2222-2222-222222222222"] }, { t: "factory", id },
      { t: "analytics", days: 30 }, { t: "analytics", days: 7 }, { t: "sources" },
    ]);
  });
  it("не больше шести карточек и пяти новостей в одной", async () => {
    const { cleanRefs } = await import("../src/lib/agent/cards");
    const ids = Array.from({ length: 9 }, (_, i) => `00000000-0000-0000-0000-00000000000${i}`);
    assert.equal((cleanRefs([{ type: "news", ids }])[0] as { ids: string[] }).ids.length, 5);
    assert.equal(cleanRefs(Array.from({ length: 12 }, () => ({ type: "sources" }))).length, 6);
    assert.deepEqual(cleanRefs(undefined), []);
  });
});
