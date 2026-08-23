import { NextRequest } from "next/server";
import { getGateway } from "@/lib/dns-lookup";
import { rejectUnlessLocalOrigin } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalOrigin(request);
  if (denied) return denied;
  const info = await getGateway();
  return Response.json(info);
}
