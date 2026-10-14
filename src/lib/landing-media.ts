import { existsSync } from "node:fs";
import { join } from "node:path";

/** Есть ли файл в public (проверяется при сборке): так видео и GIF подхватываются сами, как только их положат в папку. */
export const hasMedia = (rel: string) => { try { return existsSync(join(process.cwd(), "public", rel)); } catch { return false; } };
