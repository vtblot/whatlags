import { NextRequest } from "next/server";
import { runBufferbloat } from "@/lib/bufferbloat";
import { isValidTarget, normalizeTarget } from "@/lib/host";
import { allowLanFromRequest, rejectUnlessLocalOrigin } from "@/lib/local-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalOrigin(request);
  if (denied) return denied;
  const allowLan = allowLanFromRequest(request);
  const target = normalizeTarget(
    request.nextUrl.searchParams.get("target") ?? "1.1.1.1",
  );
  if (!isValidTarget(target, { allowLan })) {
    return Response.json({ error: "Cible invalide." }, { status: 400 });
  }

  try {
    const result = await runBufferbloat(target, { allowLan });
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
