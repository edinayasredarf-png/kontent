import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { fail, mockVk, ok } from "./mock-vk";

let vkm: Awaited<ReturnType<typeof mockVk>>;
let vk: typeof import("../src/lib/publishing/vk");
let png: Buffer, jpg: Buffer, webp: Buffer;

before(async () => {
  vkm = await mockVk();
  process.env.VK_API_BASE = vkm.base;
  vk = await import("../src/lib/publishing/vk");
  const base = sharp({ create: { width: 64, height: 64, channels: 3, background: "#3366ff" } });
  [png, jpg, webp] = await Promise.all([base.clone().png().toBuffer(), base.clone().jpeg().toBuffer(), base.clone().webp().toBuffer()]);
});
after(() => vkm.close());
beforeEach(() => vkm.clear());

const cred = { token: "SECRET-TOKEN", target: "-123" };
const post = () => vkm.last("/method/wall.post")!.params;

describe("VK: публикация текста", () => {
  it("публикует от имени сообщества и возвращает ссылку", async () => {
    vkm.on("/method/wall.post", () => ok({ post_id: 77 }));
    const r = await vk.vk.publish({ text: "Привет" }, cred);
    assert.equal(r.url, "https://vk.com/wall-123_77");
    assert.equal(post().owner_id, "-123");
    assert.equal(post().from_group, "1");
    assert.equal(post().message, "Привет");
  });
  it("токен идёт в теле запроса, не в адресе", async () => {
    vkm.on("/method/wall.post", () => ok({ post_id: 1 }));
    await vk.vk.publish({ text: "x" }, cred);
    const h = vkm.last("/method/wall.post")!;
    assert.equal(h.params.access_token, "SECRET-TOKEN");
    assert.ok(!h.path.includes("SECRET"));
  });
  it("guid одинаков для одного dedupeKey и разный для разных (повтор не создаёт дубль)", async () => {
    vkm.on("/method/wall.post", () => ok({ post_id: 1 }));
    await vk.vk.publish({ text: "a", dedupeKey: "pub-1" }, cred);
    const g1 = post().guid;
    await vk.vk.publish({ text: "a", dedupeKey: "pub-1" }, cred);
    const g2 = post().guid;
    await vk.vk.publish({ text: "a", dedupeKey: "pub-2" }, cred);
    assert.ok(g1 && g1 === g2 && g1 !== post().guid);
  });
});

describe("VK: ошибки", () => {
  it("ограничение частоты (код 6) — временная ошибка", async () => {
    vkm.on("/method/wall.post", () => fail(6, "Too many requests per second"));
    await assert.rejects(vk.vk.publish({ text: "x" }, cred), (e: Error & { retryable?: boolean }) => e.retryable === true);
  });
  it("недействительный ключ (код 5) — постоянная ошибка", async () => {
    vkm.on("/method/wall.post", () => fail(5, "User authorization failed"));
    await assert.rejects(vk.vk.publish({ text: "x" }, cred), (e: Error & { retryable?: boolean }) => e.retryable === false && /код 5/.test(e.message));
  });
  it("обрыв соединения при публикации — временная ошибка (повтор безопасен благодаря guid)", async () => {
    vkm.on("/method/wall.post", () => "__hang");
    process.env.VK_TEST_TIMEOUT = "1";
    const bad = { token: "t", target: "1" };
    // сервер не отвечает: проверяем через недоступный адрес, чтобы тест не ждал таймаут в 20 с
    const old = process.env.VK_API_BASE; process.env.VK_API_BASE = "http://127.0.0.1:1";
    await assert.rejects(vk.vk.publish({ text: "x" }, bad), (e: Error & { retryable?: boolean }) => e.retryable === true);
    process.env.VK_API_BASE = old;
  });
  it("неверные данные канала отклоняются до обращения к VK", async () => {
    await assert.rejects(vk.vk.publish({ text: "x" }, { token: "", target: "abc" }), /нужны ключ доступа/);
    assert.equal(vkm.hits.length, 0);
  });
});

describe("VK: изображения", () => {
  const upload = () => {
    vkm.on("/method/photos.getWallUploadServer", () => ok({ upload_url: `${vkm.base}/upload/wall`, album_id: -14, user_id: 1 }));
    vkm.on("/upload/wall", () => ({ server: 1, photo: "[{\"x\":1}]", hash: "h" }));
    vkm.on("/method/photos.saveWallPhoto", () => ok([{ id: 5, owner_id: 9 }]));
    vkm.on("/method/wall.post", () => ok({ post_id: 10 }));
  };
  it("личный ключ: загрузка на стену → сохранение → запись с вложением photo", async () => {
    upload();
    vkm.on("/method/wall.getById", () => ok({ items: [{ attachments: [{}] }] }));
    const r = await vk.vk.publish({ text: "t", image: { data: png, mime: "image/png" } }, { ...cred, mode: "user" });
    assert.equal(post().attachments, "photo9_5");
    assert.equal(r.warning, undefined);
  });
  it("WebP перед отправкой превращается в JPEG", async () => {
    upload();
    vkm.on("/method/wall.getById", () => ok({ items: [{ attachments: [{}] }] }));
    await vk.vk.publish({ text: "t", image: { data: webp, mime: "image/webp" } }, { ...cred, mode: "user" });
    const body = vkm.last("/upload/wall")!.body!;
    assert.ok(body.includes(Buffer.from([0xff, 0xd8, 0xff])), "в теле загрузки есть сигнатура JPEG");
    assert.ok(!body.includes(Buffer.from("RIFF")), "WebP не отправлен");
  });
  it("ключ сообщества: стена закрыта (27), файл (15) → картинка уходит ссылкой-карточкой", async () => {
    vkm.on("/method/photos.getWallUploadServer", () => fail(27, "Group authorization failed: method is unavailable with group auth."));
    vkm.on("/method/docs.getWallUploadServer", () => fail(15, "Access denied: User can't upload docs to this group"));
    vkm.on("/method/wall.post", () => ok({ post_id: 3 }));
    const r = await vk.vk.publish({ text: "t", image: { data: jpg, mime: "image/jpeg" }, imageUrl: "https://app.example/api/pub/11111111-1111-1111-1111-111111111111?s=abc" }, cred);
    assert.equal(post().attachments, "https://app.example/api/pub/11111111-1111-1111-1111-111111111111/card?s=abc");
    assert.equal(r.warning, undefined);
    assert.equal(vkm.count("/method/photos.getMessagesUploadServer"), 0, "фото через сообщения не пробуем, пока есть карточка");
  });
  it("карусель без личного ключа: карточка первого слайда и пояснение", async () => {
    vkm.on("/method/photos.getWallUploadServer", () => fail(27, "group auth"));
    vkm.on("/method/wall.post", () => ok({ post_id: 4 }));
    const r = await vk.vk.publish({ text: "t", images: [{ data: jpg, mime: "image/jpeg" }, { data: jpg, mime: "image/jpeg" }], imageUrl: "https://app.example/api/pub/22222222-2222-2222-2222-222222222222?s=z" }, cred);
    assert.match(r.warning ?? "", /только с первым слайдом из 2/);
  });
  it("все способы отказали: пост публикуется текстом, причина в предупреждении", async () => {
    vkm.on("/method/photos.getWallUploadServer", () => fail(27, "group auth"));
    vkm.on("/method/docs.getWallUploadServer", () => fail(15, "Access denied"));
    vkm.on("/method/photos.getMessagesUploadServer", () => fail(15, "Access denied"));
    vkm.on("/method/wall.post", () => ok({ post_id: 8 }));
    const r = await vk.vk.publish({ text: "t", image: { data: jpg, mime: "image/jpeg" } }, cred);
    assert.equal(post().attachments, undefined);
    assert.match(r.warning ?? "", /Картинка не загружена/);
  });
  it("вложение, которое VK молча отбросил, не остаётся «успехом»: пост удаляется, пробуем дальше", async () => {
    upload();
    vkm.on("/method/wall.getById", () => ok({ items: [{ attachments: [] }] }));
    vkm.on("/method/wall.delete", () => ok(1));
    vkm.on("/method/docs.getWallUploadServer", () => fail(15, "Access denied"));
    const r = await vk.vk.publish({ text: "t", image: { data: png, mime: "image/png" } }, { ...cred, mode: "user" });
    assert.equal(vkm.count("/method/wall.delete"), 1);
    assert.match(r.warning ?? "", /Картинка не загружена/);
  });
});

describe("VK: видео", () => {
  const save = () => {
    vkm.on("/method/video.save", () => ok({ upload_url: `${vkm.base}/upload/video`, video_id: 42, owner_id: -123, access_key: "ak" }));
    vkm.on("/upload/video", () => ({ video_id: 42, owner_id: -123 }));
    vkm.on("/method/wall.post", () => ok({ post_id: 12 }));
  };
  it("ждёт обработки и только потом публикует запись с вложением video", async () => {
    save();
    let n = 0;
    vkm.on("/method/video.get", () => ok({ items: [{ processing: ++n < 3 ? 1 : 0 }] }));
    const att = await vk.uploadVideo("t", "123", { data: Buffer.from("mp4"), mime: "video/mp4" }, "Видео", { pollMs: 5 });
    assert.equal(att, "video-123_42_ak");
    assert.equal(n, 3);
  });
  it("слишком долгая обработка — временная ошибка, а не публикация недоделанного ролика", async () => {
    save();
    vkm.on("/method/video.get", () => ok({ items: [{ processing: 1 }] }));
    await assert.rejects(vk.uploadVideo("t", "123", { data: Buffer.from("mp4"), mime: "video/mp4" }, "В", { waitMs: 30, pollMs: 10 }), (e: Error & { retryable?: boolean }) => e.retryable === true);
  });
  it("ключ сообщества (video.save недоступен) — понятная ошибка, пост не создаётся", async () => {
    vkm.on("/method/video.save", () => fail(27, "Group authorization failed: method is unavailable with group auth."));
    vkm.on("/method/wall.post", () => ok({ post_id: 1 }));
    await assert.rejects(vk.vk.publish({ text: "t", video: { data: Buffer.from("x"), mime: "video/mp4" } }, cred), /код 27/);
    assert.equal(vkm.count("/method/wall.post"), 0);
  });
});

describe("Карточка-ссылка для VK", () => {
  it("картинка превью — 1200×630 JPEG независимо от формы слайда", async () => {
    const { ogCard } = await import("../src/lib/pub-image");
    for (const [w, h] of [[1080, 1080], [1080, 1350], [400, 300]]) {
      const src = await sharp({ create: { width: w, height: h, channels: 3, background: "#ff3366" } }).png().toBuffer();
      const out = await sharp(await ogCard(src)).metadata();
      assert.deepEqual([out.width, out.height, out.format], [1200, 630, "jpeg"]);
    }
  });
});

describe("VK: пустой ответ загрузки", () => {
  it("повторяет загрузку и в ошибке показывает размеры файла", async () => {
    vkm.on("/method/photos.getWallUploadServer", () => fail(27, "group auth"));
    vkm.on("/method/docs.getWallUploadServer", () => fail(15, "denied"));
    vkm.on("/method/photos.getMessagesUploadServer", () => ok({ upload_url: `${vkm.base}/upload/msg` }));
    vkm.on("/upload/msg", () => ({ server: 9, photo: "", hash: "h" }));
    vkm.on("/method/wall.post", () => ok({ post_id: 1 }));
    const r = await vk.vk.publish({ text: "t", image: { data: jpg, mime: "image/jpeg" } }, cred);
    assert.equal(vkm.count("/method/photos.getMessagesUploadServer"), 2);
    assert.match(r.warning ?? "", /64×64/);
  });
});
