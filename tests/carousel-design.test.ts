import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("дизайн карусели", () => {
  it("принимает только верный HEX, шрифт из каталога или Google Fonts и известный формат", async () => {
    const { cleanDesign } = await import("../src/lib/carousel/service");
    assert.deepEqual(cleanDesign({ color: "#FF7A00", font: "oswald", format: "square" }), { color: "#ff7a00", font: "oswald", format: "square" });
    assert.deepEqual(cleanDesign({ font: "gf:Pacifico" }), { font: "gf:Pacifico" });
    assert.deepEqual(cleanDesign({ color: "red", font: "../../etc/passwd", format: "wide" }), {}, "мусор отбрасывается");
    assert.deepEqual(cleanDesign({ color: "#12345", font: "gf:<script>" }), {});
    assert.deepEqual(cleanDesign(null), {});
  });
});
