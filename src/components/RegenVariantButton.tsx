"use client";
import { SubmitButton } from "@/components/SubmitButton";

/** «Пересоздать» одну площадку: запоминает, какую именно, в скрытом поле only формы, и отправляет форму другим действием. */
export function RegenVariantButton({ platform, action, children, title }: { platform: string; action: (f: FormData) => void | Promise<void>; children: React.ReactNode; title?: string }) {
  return (
    <SubmitButton formAction={action} title={title} className="pill pill-sm"
      onClick={(e) => { const el = e.currentTarget.form?.elements.namedItem("only") as HTMLInputElement | null; if (el) el.value = platform; }}>
      {children}
    </SubmitButton>
  );
}
