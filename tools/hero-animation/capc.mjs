import { chromium } from "playwright-core";
import fs from "node:fs";
const [,, key, mode = "test", ...rest] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-x64/chrome-headless-shell" });
const page = await browser.newPage({ viewport: { width: 516, height: 384 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGEERR", key, e.message));
await page.goto("file://" + process.cwd() + "/cards.html?s=" + key);
await page.waitForFunction(() => typeof window.render === "function", null, { timeout: 8000 });
await page.waitForTimeout(300);
if (mode === "test") { fs.mkdirSync("tc", { recursive: true }); for (const t of rest.map(Number)) { await page.evaluate((t) => window.render(t), t); await page.screenshot({ path: `tc/${key}-${t}.png` }); } }
else { const d = `fc/${key}`; fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); const N = Math.round((await page.evaluate(() => window.LEN)) * 24); for (let i = 0; i < N; i++) { await page.evaluate((t) => window.render(t), i / 24); await page.screenshot({ path: `${d}/f${String(i).padStart(4, "0")}.png` }); } }
await browser.close();
