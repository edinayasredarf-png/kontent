import { NextRequest } from "next/server";
import { vkChannelCallbackHandler } from "@/lib/channel-callback";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest) { return vkChannelCallbackHandler(req); }
