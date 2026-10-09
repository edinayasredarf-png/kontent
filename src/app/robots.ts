import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/legal/"], disallow: ["/app", "/api/", "/suggest", "/r/", "/invite/", "/reset/", "/suspended", "/update-required"] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
