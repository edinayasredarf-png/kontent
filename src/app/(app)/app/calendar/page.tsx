import { ContentCalendar } from "@/components/ContentCalendar";

export const maxDuration = 300;
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ContentCalendar sp={await searchParams} />;
}
