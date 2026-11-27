import { open, seal } from "./crypto";
import { tx } from "./db";
import { PublishError } from "./publishing/types";
import { isSocialProvider } from "./social-oauth-catalog";
import { refreshSocialToken } from "./social-oauth";

/** Refresh under a row lock: concurrent queues cannot rotate the same refresh token twice. */
export async function socialChannelCredentials(orgId: string, channelId: string, kind: string, raw: unknown): Promise<Record<string, string>> {
  const initial = open(raw);
  if (!isSocialProvider(kind) || initial.oauth !== kind || !initial.expiresAt || Number(initial.expiresAt) > Date.now() + 300000) return initial;
  try {
    return await tx(async run => {
      const [row] = await run<{ credentials: unknown }>("select credentials from kz_channels where id=$1 and org_id=$2 and kind=$3 for update", [channelId, orgId, kind]);
      if (!row) throw new PublishError("Канал удалён или изменился.");
      const current = open(row.credentials);
      if (current.oauth !== kind || !current.expiresAt || Number(current.expiresAt) > Date.now() + 300000) return current;
      const next = await refreshSocialToken(kind, current);
      await run("update kz_channels set credentials=$3 where id=$1 and org_id=$2", [channelId, orgId, JSON.stringify(seal(next))]);
      return next;
    });
  } catch (e) { if (e instanceof PublishError) throw e; throw new PublishError("Доступ к соцсети не удалось обновить. Нажмите «Переподключить» в разделе «Каналы»."); }
}
