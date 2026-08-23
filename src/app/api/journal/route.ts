import { NextRequest } from "next/server";
import { openLogsDir, snapshot } from "@/lib/journal";
import { todayStamp } from "@/lib/paths";
import { startWatch } from "@/lib/watch";
import { rejectUnlessLocalOrigin, rejectUnlessLocalWrite } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalOrigin(request);
  if (denied) return denied;
  startWatch();
  const day = request.nextUrl.searchParams.get("day") ?? todayStamp();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return Response.json({ error: "Jour invalide." }, { status: 400 });
  }
  return Response.json(snapshot(day));
}

export async function POST(request: NextRequest) {
  const denied = rejectUnlessLocalWrite(request);
  if (denied) return denied;
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
