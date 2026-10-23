/**
 * Права ролей в одном месте. Роли: owner (владелец), admin, editor (редактор), viewer (наблюдатель; гостевая ссылка — тоже viewer).
 *  view     — смотреть материалы, календарь, аналитику, новости, конкурентов, публикации (все роли)
 *  write    — создавать и править материалы, запускать ИИ, публиковать, вести бренды, заводы, конкурентов (владелец, админ, редактор)
 *  manage   — подключать каналы, приглашать людей, ключи API, деньги и тариф (владелец, админ)
 *  owner    — назначать администраторов, менять тариф (только владелец)
 */
export type Cap = "view" | "write" | "manage" | "owner";
export const ROLES = ["owner", "admin", "editor", "viewer"] as const;

const LEVEL: Record<string, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
const NEED: Record<Cap, number> = { view: 1, write: 2, manage: 3, owner: 4 };

export const can = (role: string, cap: Cap) => (LEVEL[role] ?? 0) >= NEED[cap];

/** Что показывать в таблице «Кто что может» на странице команды. */
export const ROLE_MATRIX: { what: string; cap: Cap }[] = [
  { what: "Смотреть материалы, календарь, аналитику, новости, конкурентов", cap: "view" },
  { what: "Создавать и править материалы, запускать ИИ, публиковать, чат с ассистентом", cap: "write" },
  { what: "Подключать каналы публикации, приглашать людей, ключи API, баланс", cap: "manage" },
  { what: "Назначать администраторов, менять тариф", cap: "owner" },
];
