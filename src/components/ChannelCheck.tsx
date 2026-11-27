"use client";
import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { isSocialProvider, SOCIAL_NAMES } from "@/lib/social-oauth-catalog";
import { startChannelConnection } from "@/lib/channel-connect-actions";
import { checkSavedChannelAction, saveVkPhotoTokenAction } from "@/lib/actions";

/** Повторная проверка подключённого канала: токен жив, бот на месте. */
export function ChannelCheck({ id, kind, manage, brandId }: { id: string; kind?: string; manage?: boolean; brandId?: string }) {
  const [st, setSt] = useState<{ busy: boolean; ok?: boolean; text?: string }>({ busy: false });
  async function run() {
    setSt({ busy: true });
    try { const r = await checkSavedChannelAction(id); setSt(r.ok ? { busy: false, ok: true, text: `Работает: ${r.name}` } : { busy: false, ok: false, text: r.error }); }
    catch { setSt({ busy: false, ok: false, text: "Не удалось выполнить проверку" }); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={run} disabled={st.busy} className="btn btn-ghost !px-2.5 !py-1 text-xs">{st.busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}Проверить</button>
      {(kind === "vk" || kind && isSocialProvider(kind)) && manage && brandId && <button type="button" disabled={st.busy} className="btn btn-accent text-xs" onClick={async () => {
        setSt({busy:true});
        try { const result = await startChannelConnection(kind as "vk" | import("@/lib/social-oauth-catalog").SocialProvider, brandId, undefined, id); if (result.ok) window.location.assign(result.url); else setSt({busy:false,ok:false,text:result.error}); }
        catch { setSt({busy:false,ok:false,text:"Не удалось начать подключение соцсети"}); }
      }}>Переподключить {kind && isSocialProvider(kind) ? SOCIAL_NAMES[kind] : "VK"}</button>}
      {kind === "vk" && manage && <details className="w-full text-xs"><summary className="cursor-pointer text-ink2">Дополнительно — ввести ключ вручную</summary><form className="mt-3 space-y-2" action={async f => {
        setSt({ busy: true });
        try { const result = await saveVkPhotoTokenAction(id, String(f.get("photoToken") ?? "")); setSt({ busy: false, ok: result.ok, text: result.ok ? "Ключ сохранён" : result.error }); }
        catch { setSt({ busy: false, ok: false, text: "Не удалось сохранить ключ" }); }
      }}><p className="text-ink3">Ключ пользователя, который управляет сообществом, с правами photos и wall. Хранится зашифрованным.</p><input className="input" name="photoToken" aria-label="Ключ пользователя VK" type="password" required autoComplete="off" /><button className="btn btn-ghost" disabled={st.busy}>Сохранить ключ</button></form></details>}
      {st.text && <span className={`flex items-center gap-1 text-xs ${st.ok ? "text-good" : "text-bad"}`}>{st.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{st.text}</span>}
    </div>
  );
}
