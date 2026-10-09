// Собирает шрифты Inter (SIL OFL 1.1) в src/lib/carousel/fonts.ts как base64: на Vercel нет ни системных шрифтов, ни надёжного доступа к файлам.
// Запуск: npm i -D @fontsource/inter && node scripts/gen-fonts.mjs
import fs from "node:fs";
const dir = "node_modules/@fontsource/inter/files";
let out = "// Сгенерировано scripts/gen-fonts.mjs. Шрифт Inter © The Inter Project Authors, лицензия SIL OFL 1.1.\n";
for (const w of [500, 800]) for (const s of ["latin", "cyrillic"]) out += `export const INTER_${s.toUpperCase()}_${w} = "${fs.readFileSync(`${dir}/inter-${s}-${w}-normal.woff`).toString("base64")}";\n`;
fs.writeFileSync("src/lib/carousel/fonts.ts", out);
console.log("fonts.ts", (out.length / 1024).toFixed(0), "КБ");
