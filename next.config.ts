import type { NextConfig } from "next";
const nextConfig: NextConfig = { poweredByHeader: false, serverExternalPackages: ["pg"], experimental: { serverActions: { bodySizeLimit: "4mb" } } };
export default nextConfig;
