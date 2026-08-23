import { NextRequest } from "next/server";
import { getLocalAgentToken, rejectUnlessLocalOrigin } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalOrigin(request);
  if (denied) return denied;
  return Response.json({ token: getLocalAgentToken() });
}
