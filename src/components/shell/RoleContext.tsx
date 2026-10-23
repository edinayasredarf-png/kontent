"use client";
import { createContext, useContext } from "react";

export interface RoleInfo { role: string; guest: boolean }
const Ctx = createContext<RoleInfo>({ role: "owner", guest: false });
export const RoleProvider = Ctx.Provider;

/** Роль текущего человека в клиентских компонентах: наблюдателю кнопки действий показываются неактивными или скрываются. */
export const useRole = () => useContext(Ctx);
export const useReadOnly = () => useContext(Ctx).role === "viewer";
export const READONLY_HINT = "Недостаточно прав: у вас доступ только для просмотра";
