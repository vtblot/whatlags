import { NextRequest } from "next/server";
import { icmpPing } from "@/lib/ping";
import { PING_MAX_COUNT } from "@/lib/budget";
import { isValidTarget, normalizeTarget } from "@/lib/host";
import { allowLanFromRequest, rejectUnlessLocalOrigin } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalOrigin(request);
  if (denied) return denied;
  const allowLan = allowLanFromRequest(request);
  const target = normalizeTarget(
    request.nextUrl.searchParams.get("target") ?? "1.1.1.1",
  );
  const count = Math.min(
    PING_MAX_COUNT,
    Math.max(1, Number(request.nextUrl.searchParams.get("count") ?? 6) || 6),
  );

  if (!isValidTarget(target, { allowLan })) {
    return Response.json({ error: "Cible invalide." }, { status: 400 });
  }

  try {
    const result = await icmpPing(target, count, { allowLan });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ping impossible." },
      { status: 500 },
    );
  }
}
