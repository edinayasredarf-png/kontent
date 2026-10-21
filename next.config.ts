import type { NextConfig } from "next";
const nextConfig: NextConfig = { poweredByHeader: false, serverExternalPackages: ["pg"], outputFileTracingIncludes: { "/app/**/*": ["./public/fonts/**/*"], "/api/**/*": ["./public/fonts/**/*"] }, experimental: { serverActions: { bodySizeLimit: "4mb" } } };
export default nextConfig;
