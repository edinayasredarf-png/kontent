import { describe, it } from "node:test";
import assert from "node:assert/strict";

const skipDb = !process.env.TEST_DATABASE_URL && "нет TEST_DATABASE_URL";

describe("почта из админки", { skip: skipDb }, () => {
  it("сохраняет настройки с зашифрованным паролем, пустой пароль оставляет прежний, удаление убирает настройки", async () => {
    const { saveMailConfig, mailState, clearMailConfig } = await import("../src/lib/mail");
    const { one } = await import("../src/lib/db");
    delete process.env.SMTP_HOST;
    await clearMailConfig();
    assert.equal((await mailState()).configured, false);
    assert.equal((await saveMailConfig({ host: "smtp.example.ru", port: 465, secure: true, user: "a@example.ru", pass: "", from: "" })).ok, false, "без пароля нельзя");
    assert.equal((await saveMailConfig({ host: "bad host!", port: 465, secure: true, user: "a", pass: "x", from: "" })).ok, false);
    assert.equal((await saveMailConfig({ host: "smtp.example.ru", port: 465, secure: true, user: "a@example.ru", pass: "секрет-123", from: "" })).ok, true);
    const st = await mailState();
    assert.equal(st.configured, true); assert.equal(st.source, "admin"); assert.equal(st.from, "a@example.ru");
    const raw = JSON.stringify((await one<{ value: unknown }>("select value from kz_platform_settings where key='mail'"))!.value);
    assert.ok(!raw.includes("секрет-123"), "пароль в базе не лежит открытым текстом");
    assert.equal((await saveMailConfig({ host: "smtp.example.ru", port: 587, secure: false, user: "a@example.ru", pass: "", from: "Бренд <a@example.ru>" })).ok, true, "пустой пароль — оставить прежний");
    assert.equal((await mailState()).from, "Бренд <a@example.ru>");
    await clearMailConfig();
    assert.equal((await mailState()).configured, false);
  });
});
