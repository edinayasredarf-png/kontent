import { ContentPublications } from "@/components/ContentPublications";

export default async function Publications({ searchParams }: { searchParams: Promise<{ n?: string; item?: string; err?: string; note?: string; r?: string; from?: string; to?: string; brand?: string; kind?: string; status?: string; channel?: string }> }) {
  return <ContentPublications sp={await searchParams} />;
}
