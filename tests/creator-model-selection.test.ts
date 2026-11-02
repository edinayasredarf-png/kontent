import { test } from "node:test";
import assert from "node:assert/strict";
import { chat, withCreatorTextModel } from "../src/lib/ai";

test("выбор модели изолирован между параллельными генерациями и вложенными вызовами", async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.SELFHOSTED_LLM_URL;
  process.env.SELFHOSTED_LLM_URL = "https://gateway.example.invalid/v1";
  const seen: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const { model } = JSON.parse(String(init?.body));
    await new Promise(resolve => setTimeout(resolve, model === "model-a" ? 15 : 1));
    seen.push(model);
    return Response.json({choices:[{message:{content:model}}]});
  };
  try {
    const call = () => chat("post", "system", "user", {maxTokens:10,temperature:0});
    const result = await Promise.all([
      withCreatorTextModel("model-a", async () => [await call(), await withCreatorTextModel("nested", call), await call()]),
      withCreatorTextModel("model-b", async () => [await call(), await call()]),
    ]);
    assert.deepEqual(result, [["model-a","nested","model-a"],["model-b","model-b"]]);
    assert.equal(seen.length,5);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SELFHOSTED_LLM_URL; else process.env.SELFHOSTED_LLM_URL = oldUrl;
  }
});

test("сервер разрешает только назначенные текстовые модели", {skip: !process.env.TEST_DATABASE_URL}, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const {textModels,validateTextModel} = await import("../src/lib/creator/models");
  const list = await textModels();
  assert.ok(list.length > 0);
  assert.equal(await validateTextModel(list[0]),list[0]);
  assert.equal(await validateTextModel(""),"");
  await assert.rejects(() => validateTextModel("not-configured-model"), /Модель недоступна/);
});
