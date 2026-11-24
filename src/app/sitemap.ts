import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { MARKETING_UPDATED, PRODUCT_PAGES } from "@/lib/marketing-content";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/vozmozhnosti`, lastModified: MARKETING_UPDATED, changeFrequency: "monthly", priority: 0.8 },
    ...PRODUCT_PAGES.map(p => ({ url: `${SITE}/vozmozhnosti/${p.slug}`, lastModified: MARKETING_UPDATED, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: `${SITE}/requisites`, changeFrequency: "yearly", priority: 0.3 },
    ...["privacy", "terms", "cookies", "consent"].map((d) => ({ url: `${SITE}/legal/${d}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
