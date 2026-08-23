import { NextRequest } from "next/server";
import { rejectUnlessLocalOrigin } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalOrigin(request);
  if (denied) return denied;
  return Response.json({ t: Date.now() });
}
