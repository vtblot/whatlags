"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GameOverlay } from "@/components/game-overlay";
import { isValidTarget, normalizeTarget } from "@/lib/host";

function OverlayInner() {
  const params = useSearchParams();
  const raw = params.get("target") ?? "1.1.1.1";
  const target = isValidTarget(raw) ? normalizeTarget(raw) : "1.1.1.1";
  return (
    <div className="flex min-h-screen items-start justify-center bg-[#05070c] p-3">
      <GameOverlay target={target} showFloatHint />
    </div>
  );
}

export default function OverlayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#05070c] text-sm text-zinc-500">
          Overlay…
        </div>
      }
    >
      <OverlayInner />
    </Suspense>
  );
}
