import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { articleNeedsLoading, ARTICLE_STATUS } from "../src/lib/monitor/article-state";

describe("automatic article eligibility", () => {
  it("loads new and legacy RSS articles without waiting for a button", () => {
    assert.equal(articleNeedsLoading("site", "", null), true);
    assert.equal(articleNeedsLoading("news", "ok", "старый текст"), true);
    assert.equal(articleNeedsLoading("site", "short", null), true);
    assert.equal(articleNeedsLoading("site", ARTICLE_STATUS, ""), true);
  });
  it("does not repeatedly fetch cached, unavailable or non-RSS posts", () => {
    assert.equal(articleNeedsLoading("site", ARTICLE_STATUS, "статья"), false);
    for (const status of ["unsupported", `${ARTICLE_STATUS}:short`, `${ARTICLE_STATUS}:failed`]) assert.equal(articleNeedsLoading("site", status, null), false);
    for (const kind of ["telegram", "vk", "max", "manual"]) assert.equal(articleNeedsLoading(kind, "", null), false);
  });
});
