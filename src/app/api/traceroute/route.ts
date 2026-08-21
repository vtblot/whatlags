import { NextRequest } from "next/server";
import { traceroute } from "@/lib/traceroute";
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
    const result = await traceroute(target);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Traceroute impossible.",
      },
      { status: 500 },
    );
  }
}
