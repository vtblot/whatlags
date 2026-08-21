import { NextRequest } from "next/server";
import { openLogsDir, snapshot } from "@/lib/journal";
import { todayStamp } from "@/lib/paths";
import { startWatch } from "@/lib/watch";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  startWatch();
  const day = request.nextUrl.searchParams.get("day") ?? todayStamp();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return Response.json({ error: "Jour invalide." }, { status: 400 });
  }
  return Response.json(snapshot(day));
}

export async function POST(request: NextRequest) {
  startWatch();
  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    body = {};
  }
  if (body.action === "open-folder") {
    const dir = await openLogsDir();
    return Response.json({ ok: true, dir });
  }
  return Response.json({ error: "Action inconnue." }, { status: 400 });
}
