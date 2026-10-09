import Link from "next/link";
import { redirect } from "next/navigation";
import { Factory, UsersRound } from "lucide-react";
import { readSession, requireCtx } from "@/lib/auth";
import { inviteInfo, ROLE_HINT, ROLE_LABEL } from "@/lib/team";
import { acceptInviteAction } from "@/lib/account-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Приглашение" };

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string }> }) {
  const { token } = await params;
  const { err } = await searchParams;
  if (!(await readSession())) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const c = await requireCtx();
  const inv = await inviteInfo(token);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <div className="mb-8 flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-accent text-white"><Factory size={18} /></span><b className="text-lg">Контент-завод</b></div>
      {inv ? (
        <>
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent"><UsersRound size={22} /></div>
          <h1 className="mb-1 text-2xl font-semibold">Приглашение в команду</h1>
          <p className="mb-1 text-sm text-ink2">Организация: <b className="text-ink">{inv.org_name}</b></p>
          <p className="mb-6 text-sm text-ink2">Роль: {ROLE_LABEL[inv.role]} — {ROLE_HINT[inv.role]}. Вы войдёте как {c.user.email}.</p>
          {err && <p className="mb-4 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</p>}
          <form action={acceptInviteAction}><input type="hidden" name="token" value={token} /><button className="btn btn-accent">Присоединиться</button></form>
        </>
      ) : (
        <>
          <h1 className="mb-2 text-2xl font-semibold">Приглашение недействительно</h1>
          <p className="mb-6 text-sm text-ink2">Ссылка уже использована, отозвана или истекла (приглашения живут 7 дней). Попросите прислать новую.</p>
          <Link href="/app" className="btn btn-ghost w-fit">В кабинет</Link>
        </>
      )}
    </main>
  );
}
