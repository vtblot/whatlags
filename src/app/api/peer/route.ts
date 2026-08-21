import { cachedGamePids, cachedPeer } from "@/lib/hud";
import { discoverGamePeer } from "@/lib/game-peer";
import { startWatch } from "@/lib/watch";

export const dynamic = "force-dynamic";

export async function GET() {
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
