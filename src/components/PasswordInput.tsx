"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({ name = "password", autoComplete, minLength, placeholder }: { name?: string; autoComplete: "current-password" | "new-password"; minLength?: number; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input name={name} type={show ? "text" : "password"} required minLength={minLength} autoComplete={autoComplete} placeholder={placeholder} className="input !pr-11" />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Скрыть пароль" : "Показать пароль"} aria-pressed={show} tabIndex={-1}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink3 hover:text-ink">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
