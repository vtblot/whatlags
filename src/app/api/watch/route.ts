import { NextRequest } from "next/server";
import {
  getWatchStatus,
  setWatchAllowLan,
  setWatchRunning,
  setWatchSensitivity,
  setWatchTarget,
  startWatch,
} from "@/lib/watch";
import { isValidTarget, normalizeTarget } from "@/lib/host";
import { allowLanFromRequest, rejectUnlessLocalOrigin, rejectUnlessLocalWrite } from "@/lib/local-auth";
import { SPIKE_SENSITIVITY, type SpikeSensitivity } from "@/lib/suspects";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalOrigin(request);
  if (denied) return denied;
  startWatch();
  return Response.json(getWatchStatus());
}

export async function POST(request: NextRequest) {
  const denied = rejectUnlessLocalWrite(request);
  if (denied) return denied;
  startWatch();
  let body: {
    running?: boolean;
    target?: string;
    sensitivity?: SpikeSensitivity;
    allowLan?: boolean;
    private?: boolean;
  } = {};
  try {
    body = (await request.json()) as {
      running?: boolean;
      target?: string;
      sensitivity?: SpikeSensitivity;
      allowLan?: boolean;
      private?: boolean;
    };
  } catch {
    body = {};
  }
  try {
    const allowLan = allowLanFromRequest(request, body);
    if (typeof body.allowLan === "boolean" || typeof body.private === "boolean") {
      setWatchAllowLan(allowLan);
    }
    if (typeof body.target === "string") {
      const host = normalizeTarget(body.target);
      if (!isValidTarget(host, { allowLan })) {
        return Response.json({ error: "Cible invalide." }, { status: 400 });
      }
      setWatchTarget(host, { allowLan });
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
