import { NextRequest } from "next/server";
import { isAutostartEnabled, setAutostart } from "@/lib/autostart";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ enabled: isAutostartEnabled() });
}

export async function POST(request: NextRequest) {
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
