import { NextRequest, NextResponse } from "next/server";
import { isSocialProvider } from "@/lib/social-oauth-catalog";
import { socialChannelCallbackHandler } from "@/lib/channel-callback";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isSocialProvider(provider)) return new NextResponse("Not found", { status: 404 });
  return socialChannelCallbackHandler(req, provider);
}
