import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, calendarColor, calendarHref, calendarRange, monthCells, periodTitle, shiftPeriod, validDay } from "../src/lib/calendar";
import { CALENDAR_EDITABLE, validateCalendarEdit } from "../src/lib/calendar-edit";

test("calendar dates reject overflow, invalid months and unsupported years", () => {
  for (const d of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-20", "2026-2-01", "0000-01-01", "2101-01-01", "x"]) assert.equal(validDay(d), false, d);
  assert.equal(validDay("2028-02-29"), true);
});
test("weeks start on Monday and cross month/year boundaries", () => {
  const r = calendarRange("week", "2027-01-01");
  assert.equal(r.from, "2026-12-28"); assert.equal(r.to, "2027-01-03"); assert.equal(r.days.length, 7);
  assert.equal(calendarRange("week", "2026-11-09").from, "2026-11-09");
});
test("month grids contain trailing days, leap days and six-week months", () => {
  assert.equal(monthCells("2026-10").length, 35);
  assert.equal(monthCells("2026-11").length, 42);
  assert.equal(monthCells("2028-02").includes("2028-02-29"), true);
  const days = monthCells("2026-11"); assert.equal(days[0], "2026-10-26"); assert.equal(days.at(-1), "2026-12-06");
});
test("year query includes the complete outer month grids", () => {
  const r = calendarRange("year", "2026-08-19");
  assert.equal(r.from, monthCells("2026-01")[0]); assert.equal(r.to, monthCells("2026-12").at(-1));
  assert.ok(r.from < "2026-01-01"); assert.ok(r.to > "2026-12-31");
});
test("navigation clamps month ends and leap years instead of skipping a month", () => {
  assert.equal(shiftPeriod("month", "2026-01-31", 1), "2026-02-28");
  assert.equal(shiftPeriod("year", "2028-02-29", 1), "2029-02-28");
  assert.equal(shiftPeriod("week", "2026-12-29", 1), "2027-01-05");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});
test("period links preserve all filters and clear the previous drawer and notices", () => {
  const u = new URL(calendarHref("/app/calendar?factory=abc&status=ready&view=list&kind=post&item=old&err=oops&note=saved", { period: "day", date: "2026-11-09", m: "2026-11" }), "https://example.org");
  for (const [k, v] of Object.entries({ factory: "abc", status: "ready", view: "list", kind: "post", period: "day", date: "2026-11-09" })) assert.equal(u.searchParams.get(k), v);
  for (const k of ["item", "err", "note"]) assert.equal(u.searchParams.has(k), false);
});
test("day view queries exactly one day and titles describe the chosen period", () => {
  assert.deepEqual(calendarRange("day", "2026-11-09"), { from: "2026-11-09", to: "2026-11-09", days: ["2026-11-09"] });
  assert.equal(periodTitle("year", "2026-11-09"), "2026"); assert.equal(periodTitle("month", "2026-11-09"), "Ноябрь 2026");
});
test("post colors are allowlisted, optional, and distinct from workflow statuses", () => {
  assert.equal(calendarColor("purple")?.label, "Фиолетовый");
  assert.equal(calendarColor("ready"), undefined); assert.equal(calendarColor("red; background:url(x)"), undefined);
  assert.equal(validateCalendarEdit("Тема поста", "", "Новый текст", ""), null);
  assert.equal(validateCalendarEdit("Тема поста", "", "Новый текст", "green"), null);
  assert.ok(validateCalendarEdit("Тема поста", "", "Новый текст", "invalid"));
});
test("content edits validate length and exclude queued, generating and published posts", () => {
  assert.ok(validateCalendarEdit("x", "", "", "")); assert.ok(validateCalendarEdit("Тема", "x".repeat(301), "", ""));
  assert.ok(validateCalendarEdit("Тема", "", "x".repeat(200001), ""));
  for (const state of ["generating", "scheduled", "published"]) assert.equal(CALENDAR_EDITABLE.includes(state), false);
});
