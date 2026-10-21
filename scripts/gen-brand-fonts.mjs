// Копирует фирменные шрифты (с кириллицей) из пакетов Fontsource в public/fonts, собирает fonts.css и src/lib/fonts-catalog.ts.
// Запуск: npm i --no-save @fontsource/inter @fontsource/roboto … (см. LIST) && node scripts/gen-brand-fonts.mjs
// Лицензии: SIL OFL 1.1, Apache 2.0, Ubuntu Font Licence (см. public/fonts/LICENSES.txt).
import fs from "node:fs";
import path from "node:path";
const SRC = "node_modules/@fontsource";
const LIST = [
  ["inter", "Inter", "sans"], ["roboto", "Roboto", "sans"], ["open-sans", "Open Sans", "sans"], ["montserrat", "Montserrat", "sans"], ["raleway", "Raleway", "sans"],
  ["pt-sans", "PT Sans", "sans"], ["pt-sans-caption", "PT Sans Caption", "sans"], ["nunito", "Nunito", "sans"], ["ubuntu", "Ubuntu", "sans"], ["rubik", "Rubik", "sans"], ["manrope", "Manrope", "sans"],
  ["golos-text", "Golos Text", "sans"], ["fira-sans", "Fira Sans", "sans"], ["source-sans-3", "Source Sans 3", "sans"], ["noto-sans", "Noto Sans", "sans"], ["ibm-plex-sans", "IBM Plex Sans", "sans"], ["jost", "Jost", "sans"],
  ["pt-serif", "PT Serif", "serif"], ["playfair-display", "Playfair Display", "serif"], ["lora", "Lora", "serif"], ["merriweather", "Merriweather", "serif"], ["noto-serif", "Noto Serif", "serif"], ["roboto-slab", "Roboto Slab", "serif"], ["cormorant", "Cormorant", "serif"],
  ["oswald", "Oswald", "display"], ["unbounded", "Unbounded", "display"], ["russo-one", "Russo One", "display"], ["exo-2", "Exo 2", "display"], ["comfortaa", "Comfortaa", "display"], ["caveat", "Caveat", "hand"],
];
const out = "public/fonts"; fs.mkdirSync(out, { recursive: true });
let css = "/* Сгенерировано scripts/gen-brand-fonts.mjs. Шрифты: SIL OFL 1.1 / Apache 2.0 / Ubuntu Font Licence, пакеты @fontsource. */\n";
const cat = [];
for (const [slug, name, kind] of LIST) {
  const weights = [];
  for (const wt of [400, 700]) {
    let ok = true;
    for (const sub of ["latin", "cyrillic"]) {
      const src = path.join(SRC, slug, "files", `${slug}-${sub}-${wt}-normal.woff`);
      if (!fs.existsSync(src)) { ok = false; continue; }
      fs.copyFileSync(src, path.join(out, `${slug}-${sub}-${wt}.woff`));
    }
    if (ok) weights.push(wt);
  }
  if (!weights.length) { console.log("пропуск", slug); continue; }
  cat.push({ slug, name, kind, weights });
  for (const wt of weights) {
    css += `@font-face{font-family:"${name}";font-weight:${wt};font-style:normal;font-display:swap;src:url(/fonts/${slug}-cyrillic-${wt}.woff) format("woff");unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;}\n`;
    css += `@font-face{font-family:"${name}";font-weight:${wt};font-style:normal;font-display:swap;src:url(/fonts/${slug}-latin-${wt}.woff) format("woff");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}\n`;
  }
}
fs.writeFileSync(path.join(out, "fonts.css"), css);
const body = JSON.stringify(cat, null, 1).replace(/\n\s+/g, " ").replace(/\[ \{/, "[\n  {").replace(/\}, \{/g, "},\n  {").replace(/\} \]/, "}\n];");
fs.writeFileSync("src/lib/fonts-catalog.ts", `// Сгенерировано scripts/gen-brand-fonts.mjs: шрифты с кириллицей, файлы в public/fonts (woff: latin и cyrillic отдельно, веса 400 и 700).\nexport interface CatalogFont { slug: string; name: string; kind: "sans" | "serif" | "display" | "hand"; weights: number[] }\nexport const FONT_CATALOG: CatalogFont[] = ${body}\n`);
console.log(cat.length, "шрифтов");
