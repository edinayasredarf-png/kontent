import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Хранилище несохранённого ввода: запись, срок жизни, привязка к версии с сервера. localStorage подменяется простым объектом. */
describe("draft-store", () => {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); },
    get length() { return mem.size; }, key: (i: number) => [...mem.keys()][i] ?? null,
  };
  it("старые записи удаляются при очистке, свежие остаются", async () => {
    const { sweepDrafts } = await import("../src/lib/draft-store");
    mem.set("lt_draft:old", JSON.stringify({ v: "x", t: Date.now() - 8 * 24 * 3600_000 }));
    mem.set("lt_draft:fresh", JSON.stringify({ v: "y", t: Date.now() }));
    mem.set("other", "z");
    sweepDrafts();
    assert.equal(mem.has("lt_draft:old"), false);
    assert.equal(mem.has("lt_draft:fresh"), true);
    assert.equal(mem.get("other"), "z", "чужие ключи не трогаются");
  });
  it("битая запись не ломает чтение", async () => {
    const { sweepDrafts, clearDraft } = await import("../src/lib/draft-store");
    mem.set("lt_draft:bad", "{не json");
    assert.doesNotThrow(() => sweepDrafts());
    clearDraft("fresh"); assert.equal(mem.has("lt_draft:fresh"), false);
  });
});
