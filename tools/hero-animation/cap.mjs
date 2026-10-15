import { chromium } from "playwright-core";
import fs from "node:fs";
const [,, mode = "test", ...rest] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-x64/chrome-headless-shell" });
const page = await browser.newPage({ viewport: { width: 1920, height: 790 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("PAGEERR", e.message)); await page.goto("file://" + process.cwd() + "/scene.html");
await page.waitForFunction(() => typeof window.render === "function");
if (mode === "test") {
  fs.mkdirSync("test", { recursive: true });
  for (const t of rest.map(Number)) { await page.evaluate((t) => window.render(t), t); await page.screenshot({ path: `test/t${t}.png`, omitBackground: true }); }
} else {
  fs.mkdirSync("frames", { recursive: true });
  const N = 488, FPS = 24;
  for (let i = 0; i < N; i++) { await page.evaluate((t) => window.render(t), i / FPS); await page.screenshot({ path: `frames/f${String(i).padStart(4, "0")}.png`, omitBackground: true }); }
}
await browser.close();
