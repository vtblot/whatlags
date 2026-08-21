"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMs, formatPct, latencyTone } from "@/lib/stats";
import type { PingSummary } from "@/lib/types";

function toneClass(ms: number | null): string {
  const t = latencyTone(ms);
  if (t === "good") return "text-teal-300";
  if (t === "ok") return "text-lime-300";
  if (t === "playable") return "text-amber-300";
  if (t === "bad") return "text-rose-300";
  return "text-zinc-500";
}

export function StatsRow({ primary }: { primary: PingSummary | null }) {
  return (
    <section className="grid gap-4 md:grid-cols-4">
      <Stat
        label="Ping moyen"
        value={formatMs(primary?.avgMs ?? null)}
        className={toneClass(primary?.avgMs ?? null)}
        hint={primary ? `${primary.method.toUpperCase()} · ${primary.target}` : "ICMP depuis la veille"}
      />
      <Stat
        label="Jitter"
        value={formatMs(primary?.jitterMs ?? null)}
        className={toneClass(primary?.jitterMs != null ? primary.jitterMs * 3 : null)}
        hint="variation d’un ping à l’autre — le “ping qui saute”"
      />
      <Stat
        label="Min / max"
        value={`${formatMs(primary?.minMs ?? null, 0)} / ${formatMs(primary?.maxMs ?? null, 0)}`}
        hint="plancher vs spike"
      />
      <Stat
        label="Pertes"
        value={primary ? formatPct(primary.lossPct) : "—"}
        className={primary && primary.lossPct >= 2 ? "text-rose-300" : "text-teal-300"}
        hint={primary ? `${primary.received}/${primary.transmitted} reçus` : "échantillons"}
      />
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  className?: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`font-mono text-2xl ${className ?? "text-zinc-50"}`}>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-zinc-500">{hint}</CardContent>
    </Card>
  );
}
