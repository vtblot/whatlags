import { NextRequest } from "next/server";
import { icmpPing } from "@/lib/ping";
import { PING_MAX_COUNT } from "@/lib/budget";
import { isValidTarget, normalizeTarget } from "@/lib/host";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const target = normalizeTarget(
    request.nextUrl.searchParams.get("target") ?? "1.1.1.1",
  );
  const count = Math.min(
    PING_MAX_COUNT,
    Math.max(1, Number(request.nextUrl.searchParams.get("count") ?? 6) || 6),
  );

  if (!isValidTarget(target)) {
    return Response.json({ error: "Cible invalide." }, { status: 400 });
  }

  try {
    const result = await icmpPing(target, count);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ping impossible." },
      { status: 500 },
    );
  }
}
