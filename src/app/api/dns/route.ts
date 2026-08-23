import { lookupPresetNames, lookupName } from "@/lib/dns-lookup";
import { NextRequest } from "next/server";
import { rejectUnlessLocalOrigin } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalOrigin(request);
  if (denied) return denied;
  const name = request.nextUrl.searchParams.get("name");
  try {
    if (name) {
      if (!/^[A-Za-z0-9.-]+$/.test(name) || name.length > 253) {
        return Response.json({ error: "Nom DNS invalide." }, { status: 400 });
      }
      return Response.json([await lookupName(name)]);
    }
    return Response.json(await lookupPresetNames());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "DNS impossible." },
      { status: 500 },
    );
  }
}
