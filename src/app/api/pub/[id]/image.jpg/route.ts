import { NextRequest } from "next/server";
import { GET as base } from "../route";

export const dynamic = "force-dynamic";

/** Та же картинка по адресу с расширением .jpg (для парсеров ссылок, которым нужен «файловый» адрес). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  console.log("[pub-image]", JSON.stringify({ ua: (req.headers.get("user-agent") ?? "").slice(0, 80) }));
  return base(req, ctx);
}
