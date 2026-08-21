import { NextRequest } from "next/server";
import { runBufferbloat } from "@/lib/bufferbloat";
import { isValidTarget, normalizeTarget } from "@/lib/host";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const target = normalizeTarget(
    request.nextUrl.searchParams.get("target") ?? "1.1.1.1",
  );
  if (!isValidTarget(target)) {
    return Response.json({ error: "Cible invalide." }, { status: 400 });
  }

  try {
    const result = await runBufferbloat(target);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Test bufferbloat impossible.",
      },
      { status: 500 },
    );
  }
}
