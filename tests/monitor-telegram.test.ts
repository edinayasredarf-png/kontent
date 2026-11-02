import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseTelegram } from "../src/lib/monitor/parse";
import { telegramPostPath, telegramWidgetHeight } from "../src/lib/monitor/telegram-widget";

const wrap = (body: string, extra = "", id = "123") => `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="example_channel/${id}">${body}${extra}<a class="tgme_widget_message_date" href="https://t.me/example_channel/${id}"><time datetime="2026-11-02T10:00:00Z"></time></a></div></div>`;
const photo = (url: string) => `<a class="tgme_widget_message_photo_wrap" style="background-image:url('${url}')"></a>`;

describe("Telegram news: original text and media", () => {
  it("preserves blank lines, indentation, emoji and decoded entities without joining words", () => {
    const [post] = parseTelegram(wrap('<div class="tgme_widget_message_text"><b>Заголовок</b><br><br>  • Первый пункт<br/>  • Второй &amp; третий 😀<br><pre>  код\n    ещё</pre><a href="https://example.org">ссылка</a></div>'), "example_channel");
    assert.equal(post.body, "Заголовок\n\n  • Первый пункт\n  • Второй & третий 😀\n  код\n    ещё\nссылка");
    assert.equal(post.url, "https://t.me/example_channel/123");
  });
  it("does not truncate the body at 4000 characters", () => {
    const text = "длинный пост ".repeat(420);
    assert.equal(parseTelegram(wrap(`<div class="tgme_widget_message_text">${text}</div>`), "example_channel")[0].body, text.trim());
  });
  it("keeps photo-only posts and all ten album photos in source order", () => {
    const pictures = Array.from({ length: 10 }, (_, i) => photo(`https://cdn.example.org/photo-${i}.jpg`)).join("");
    const [post] = parseTelegram(wrap("", pictures + photo("https://cdn.example.org/photo-0.jpg")), "example_channel");
    assert.equal(post.title, "Фото из Telegram");
    assert.equal(post.body, "");
    assert.equal(post.media?.length, 10);
    assert.equal(post.media?.[9].url, "https://cdn.example.org/photo-9.jpg");
  });
  it("keeps video-only posts and skips non-post service wrappers", () => {
    assert.equal(parseTelegram(wrap('<div class="tgme_widget_message_video_player"></div>'), "example_channel")[0].title, "Видео из Telegram");
    assert.equal(parseTelegram(wrap(""), "example_channel").length, 0);
  });
  it("rejects forged post origins and posts from other channels", () => {
    const body = '<div class="tgme_widget_message_text">text</div>';
    assert.equal(parseTelegram(wrap(body).replace("https://t.me/", "https://evil.example/"), "example_channel").length, 0);
    assert.equal(parseTelegram(wrap(body), "other_channel").length, 0);
  });
});

describe("Telegram widget boundary", () => {
  it("accepts only canonical public Telegram posts", () => {
    assert.equal(telegramPostPath("https://t.me/s/example_channel/123?single"), "example_channel/123");
    assert.equal(telegramPostPath("https://telegram.me/example_channel/123"), "example_channel/123");
    for (const url of ["javascript:alert(1)", "https://t.me.evil.org/example_channel/1", "https://t.me/c/123/45", "https://t.me/+invite", "https://user@t.me/example_channel/1", "https://t.me:444/example_channel/1", "https://t.me/example_channel/0"]) assert.equal(telegramPostPath(url), null, url);
  });
  it("ignores malformed, unrelated and unbounded resize messages", () => {
    assert.equal(telegramWidgetHeight('{"event":"resize","height":723.5}'), 724);
    assert.equal(telegramWidgetHeight({ event: "resize", height: 900 }), 900);
    for (const data of ["bad json", null, { event: "ready", height: 500 }, { event: "resize", height: -1 }, { event: "resize", height: Infinity }, { event: "resize", height: 50000 }, { event: "resize", height: "900" }]) assert.equal(telegramWidgetHeight(data), null);
  });
});
