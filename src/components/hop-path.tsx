import { memo } from "react";
import { cn } from "@/lib/utils";
import { formatMs } from "@/lib/stats";
import type { Hop } from "@/lib/types";

function hopLooksInflated(hop: Hop, destMs: number | null): boolean {
  return destMs != null && hop.avgMs != null && hop.avgMs > destMs + 20;
}

function HopPathInner({ hops }: { hops: Hop[] }) {
  if (hops.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun saut. Le traceroute n’a pas encore tourné, ou ICMP est filtré de bout en bout.
      </p>
    );
  }

  const dest = [...hops].reverse().find((h) => h.avgMs != null)?.avgMs ?? null;
  const max = Math.max(1, dest ?? 1, ...hops.map((h) => {
    if (hopLooksInflated(h, dest)) return dest ?? 1;
    return h.avgMs ?? 0;
  }));

  return (
    <ol className="flex gap-2 overflow-x-auto pb-2">
      {hops.map((hop) => {
        const inflated = hopLooksInflated(hop, dest);
        const height =
          hop.avgMs == null
            ? 8
            : Math.max(10, ((inflated ? dest ?? hop.avgMs : hop.avgMs) / max) * 72);
        const tone =
          hop.avgMs == null
            ? "bg-zinc-700"
            : inflated
              ? "bg-zinc-500"
              : hop.avgMs < 15
                ? "bg-teal-400"
                : hop.avgMs < 40
                  ? "bg-amber-400"
                  : "bg-rose-400";
        return (
          <li
            key={hop.hop}
            className="flex min-w-[72px] flex-1 flex-col items-center gap-2"
          >
            <div className="flex h-20 items-end">
              <div
                className={cn("w-3 rounded-full", tone)}
                style={{ height }}
                title={formatMs(hop.avgMs)}
              />
            </div>
            <div className="text-center">
              <div className="font-mono text-[10px] text-zinc-500">#{hop.hop}</div>
              <div className="max-w-[88px] truncate font-mono text-[11px] text-zinc-200">
                {hop.host ?? "*"}
              </div>
              <div className="font-mono text-[11px] text-teal-300/90">
                {hop.avgMs == null
                  ? "*"
                  : formatMs(hop.avgMs, hop.avgMs < 10 ? 2 : 1)}
              </div>
              {inflated ? (
                <div className="text-[10px] text-zinc-500">ICMP lent</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const HopPath = memo(HopPathInner);
