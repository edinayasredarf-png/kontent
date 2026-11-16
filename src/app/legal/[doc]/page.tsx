import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { DOCS, docVersion } from "@/lib/legal-docs";

export const dynamic = "force-dynamic"; // реквизиты берутся из переменных окружения при каждом показе

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  return { title: (Object.hasOwn(DOCS, doc) ? DOCS[doc as keyof typeof DOCS].title : undefined) ?? "Документ" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = Object.hasOwn(DOCS, doc) ? DOCS[doc as keyof typeof DOCS] : undefined;
  if (!d) notFound();
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-8"><Logo href="/login" /></div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight">{d.heading}</h1>
      <p className="mb-8 text-sm text-ink3">Редакция от {docVersion}</p>
      <article className="legal">{d.body}</article>
      <div className="mt-10 border-t border-line pt-6"><LegalLinks className="mb-3" /><Link href="/login" className="text-sm text-accent-ink">← Ко входу</Link></div>
    </main>
  );
}
