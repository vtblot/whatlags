import { NextRequest } from "next/server";
import { latestFrame, startWatch } from "@/lib/watch";
import { isValidTarget, normalizeTarget } from "@/lib/host";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("target");
  const requested = raw ? normalizeTarget(raw) : "";
  if (requested && !isValidTarget(requested)) {
    return Response.json({ error: "Cible invalide." }, { status: 400 });
  }
  const status = startWatch();
  const frame = latestFrame();
  if (!frame) {
    return Response.json({
      pending: true,
      running: status.running,
      target: status.target,
    });
  }
  if (requested && frame.target !== requested) {
    return Response.json({
      pending: true,
      running: status.running,
      target: status.target,
      requested,
    });
  }
  return Response.json(frame);
}
