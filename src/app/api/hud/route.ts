import { NextRequest } from "next/server";
import { latestFrame, startWatch } from "@/lib/watch";
import { isValidTarget, normalizeTarget } from "@/lib/host";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const target = normalizeTarget(
    request.nextUrl.searchParams.get("target") ?? "1.1.1.1",
  );
  if (!isValidTarget(target)) {
    return Response.json({ error: "Cible invalide." }, { status: 400 });
  }
  const status = startWatch({ target });
  const frame = latestFrame();
  if (!frame) {
    return Response.json({
      pending: true,
      running: status.running,
      target: status.target,
    });
  }
  return Response.json(frame);
}
