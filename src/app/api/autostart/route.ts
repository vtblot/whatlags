import { NextRequest } from "next/server";
import { isAutostartEnabled, setAutostart } from "@/lib/autostart";
import { rejectUnlessLocalOrigin, rejectUnlessLocalWrite } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalOrigin(request);
  if (denied) return denied;
  return Response.json({ enabled: isAutostartEnabled() });
}

export async function POST(request: NextRequest) {
  const denied = rejectUnlessLocalWrite(request);
  if (denied) return denied;
  let body: { enabled?: boolean } = {};
  try {
    body = (await request.json()) as { enabled?: boolean };
  } catch {
    body = {};
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "enabled manquant." }, { status: 400 });
  }
  try {
    const enabled = setAutostart(body.enabled);
    return Response.json({ enabled });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Autostart impossible." },
      { status: 500 },
    );
  }
}
