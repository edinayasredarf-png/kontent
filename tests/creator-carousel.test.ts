import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { QUALITY, slidePrice } from "../src/lib/creator/consts";
import { parseModels } from "../src/lib/creator/models";
import { slidePrompt } from "../src/lib/creator/plan";
import { composePhotoSlide } from "../src/lib/carousel/photo";

const m = { id: "m", label: "M", hint: "", kop: 700, text: true };

describe("студия каруселей: цены и модели", () => {
  it("цена слайда по качеству округляется до рубля: 7 / 12 / 19 ₽", () => {
    assert.deepEqual((["1k", "2k", "4k"] as const).map((q) => slidePrice(m, q) / 100), [7, 12, 19]);
  });
  it("список моделей админа: битые строки пропускаются, text-пометка читается", () => {
    const l = parseModels("gpt-image-1 | GPT Image | Ровный текст | 7 | text\n\n??? | x | y | 5\nnano | Nano | Дешевле | 5,5");
    assert.equal(l.length, 2);
    assert.equal(l[0].text, true);
    assert.equal(l[1].kop, 550);
    assert.equal(l[1].text, false);
  });
});

describe("запрос к модели картинок", () => {
  const base = { style: "dark cinematic", visual: "a burnt forest at dusk", title: "800 га", body: "леса погибло", aspect: "portrait" as const, textInImage: false };
  it("без текста на картинке: запрещены буквы, сцена и стиль серии на месте", () => {
    const p = slidePrompt(base);
    assert.match(p, /dark cinematic/); assert.match(p, /burnt forest/); assert.match(p, /NO text/);
  });
  it("с текстом от нейросети: заголовок передаётся дословно", () => {
    assert.match(slidePrompt({ ...base, textInImage: true }), /«800 га»/);
  });
});

describe("сборка слайда", () => {
  it("картинка + текст → JPEG нужной ширины и формата 4:5, для 2K шире", async () => {
    const bg = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#224" } }).png().toBuffer();
    const o = { bg, title: "800 гектаров леса", body: "Пожары и вредители уничтожили лес в области", index: 1, total: 5, brandName: "Бренд", format: "portrait" as const, kit: {}, logo: null, overlay: true };
    const a = await composePhotoSlide({ ...o, width: 1080 });
    assert.equal(a.width, 1080); assert.equal(a.height, 1350);
    const b = await composePhotoSlide({ ...o, width: QUALITY["2k"].width });
    assert.equal(b.width, 1620); assert.equal(b.height, 2025);
    const plain = await sharp(bg).resize(1080, 1350).jpeg().toBuffer();
    assert.notDeepEqual(a.data.subarray(0, 2000), plain.subarray(0, 2000)); // текст действительно нарисован
  });
});
