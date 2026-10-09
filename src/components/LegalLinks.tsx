import Link from "next/link";

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Документы" className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink3 ${className}`}>
      <Link href="/legal/privacy" className="hover:text-ink2">Политика конфиденциальности</Link>
      <Link href="/legal/terms" className="hover:text-ink2">Пользовательское соглашение</Link>
      <Link href="/legal/cookies" className="hover:text-ink2">Cookie</Link>
    </nav>
  );
}
