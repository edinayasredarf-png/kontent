import { redirect } from "next/navigation";

/** Старый адрес студии каруселей: теперь это общая панель создания. */
export default function Old() { redirect("/app/create?type=carousel"); }
