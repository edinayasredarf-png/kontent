import { NextRequest, NextResponse } from "next/server";
import { readSession, validSession } from "@/lib/auth";
import { appOrigin } from "@/lib/oauth";
import { deleteAvatar, saveAvatar, MAX_AVATAR_UPLOAD } from "@/lib/avatar";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Только запросы с нашего сайта: форма с чужого адреса не сможет поменять аватарку. */
function sameSite(req: NextRequest): boolean {
  const o = req.headers.get("origin");
  if (!o) return true; // не браузерные клиенты Origin не шлют; куки сессии у них нет
  const norm = (u: string) => { try { return new URL(u).origin; } catch { return ""; } };
  return norm(o) === norm(appOrigin(req));
}

/** Своя аватарка: POST (multipart, поле file) заменяет, DELETE убирает. Работает для любого участника, не только редактора. */
export async function POST(req: NextRequest) {
  const s = await readSession();
  if (!s || !(await validSession(s))) return NextResponse.json({ error: "Войдите заново" }, { status: 401 });
  if (!sameSite(req)) return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Не удалось прочитать файл (возможно, он больше 4 МБ)" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
  if (file.size > MAX_AVATAR_UPLOAD) return NextResponse.json({ error: "Файл больше 6 МБ" }, { status: 413 });
  try { await saveAvatar(s.uid, Buffer.from(await file.arrayBuffer()), "upload"); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ ok: true, v: Math.floor(Date.now() / 1000) });
}

export async function DELETE(req: NextRequest) {
  const s = await readSession();
  if (!s || !(await validSession(s))) return NextResponse.json({ error: "Войдите заново" }, { status: 401 });
  if (!sameSite(req)) return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  await deleteAvatar(s.uid);
  return NextResponse.json({ ok: true });
}
