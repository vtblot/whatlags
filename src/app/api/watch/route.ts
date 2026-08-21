import { NextRequest } from "next/server";
import {
  getWatchStatus,
  setWatchRunning,
  setWatchSensitivity,
  setWatchTarget,
  startWatch,
} from "@/lib/watch";
import { isValidTarget, normalizeTarget } from "@/lib/host";
import { SPIKE_SENSITIVITY, type SpikeSensitivity } from "@/lib/suspects";

export const dynamic = "force-dynamic";

export async function GET() {
  startWatch();
  return Response.json(getWatchStatus());
}

export async function POST(request: NextRequest) {
  startWatch();
  let body: { running?: boolean; target?: string; sensitivity?: SpikeSensitivity } = {};
  try {
    body = (await request.json()) as {
      running?: boolean;
      target?: string;
      sensitivity?: SpikeSensitivity;
    };
  } catch {
    body = {};
  }
  try {
    if (typeof body.target === "string") {
      const host = normalizeTarget(body.target);
      if (!isValidTarget(host)) {
        return Response.json({ error: "Cible invalide." }, { status: 400 });
      }
      setWatchTarget(host);
    }
    if (typeof body.running === "boolean") {
      setWatchRunning(body.running);
    }
    if (body.sensitivity && body.sensitivity in SPIKE_SENSITIVITY) {
      setWatchSensitivity(body.sensitivity);
    }
    return Response.json(getWatchStatus());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Veille impossible." },
      { status: 400 },
    );
  }
}
