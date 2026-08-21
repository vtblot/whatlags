import { NextRequest } from "next/server";
import { captureHud } from "@/lib/hud";
import { isValidTarget, normalizeTarget } from "@/lib/host";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const target = normalizeTarget(
    request.nextUrl.searchParams.get("target") ?? "1.1.1.1",
  );
  if (!isValidTarget(target)) {
    return Response.json({ error: "Cible invalide." }, { status: 400 });
  }
  try {
    const frame = await captureHud(target);
    return Response.json(frame);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "HUD impossible." },
      { status: 500 },
    );
  }
}
