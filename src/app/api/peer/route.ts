import { NextRequest } from "next/server";
import { cachedGamePids, cachedPeer } from "@/lib/hud";
import { discoverGamePeer } from "@/lib/game-peer";
import { startWatch } from "@/lib/watch";
import { rejectUnlessLocalOrigin } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalOrigin(request);
  if (denied) return denied;
  startWatch();
  const cached = cachedPeer();
  const pids = cachedGamePids();
  const peer = cached ?? (await discoverGamePeer(pids).catch(() => null));
  if (!peer) {
    return Response.json({
      peer: null,
      hint: "Lance un jeu (ou attends un scan process) pour détecter le peer UDP.",
    });
  }
  return Response.json({ peer });
}
