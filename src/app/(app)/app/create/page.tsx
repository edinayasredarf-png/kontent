import { ContentStudio } from "@/components/ContentStudio";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export default async function Create({ searchParams }: { searchParams: Promise<{ type?: string; factory?: string; item?: string; draft?: string; err?: string; note?: string }> }) {
  return <ContentStudio sp={await searchParams} />;
}
