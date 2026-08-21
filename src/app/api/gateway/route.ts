import { getGateway } from "@/lib/dns-lookup";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = await getGateway();
  return Response.json(info);
}
