import type { NextConfig } from "next";
const nextConfig: NextConfig = { ...(process.env.TIMEWEB_STANDALONE === "1" ? { output: "standalone" as const } : {}), poweredByHeader: false, serverExternalPackages: ["pg", "pdf-parse"], outputFileTracingIncludes: { "/app/**/*": ["./public/fonts/**/*"], "/api/**/*": ["./public/fonts/**/*"] }, experimental: { serverActions: { bodySizeLimit: "4mb" }, staleTimes: { dynamic: 30, static: 300 }, optimizePackageImports: ["lucide-react"] } };
export default nextConfig;
