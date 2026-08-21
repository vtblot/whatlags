"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FolderOpenIcon } from "lucide-react";
import type { HudFrame } from "@/lib/suspects";
import { formatMs } from "@/lib/stats";
import { cn } from "@/lib/utils";

type JournalPayload = {
  dir: string;
  day: string;
  sessionSpikes: HudFrame[];
  disk: HudFrame[];
  error?: string;
};

function fmtTime(at: number): string {
  return new Date(at).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function metric(v: number | null | undefined, suffix: string): string {
  if (v == null) return "—";
  return `${Math.round(v)}${suffix}`;
}

export function JournalPanel() {
  const [data, setData] = useState<JournalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch("/api/journal", { cache: "no-store", signal });
    const json = (await res.json()) as JournalPayload;
    if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
    setData(json);
    setError(null);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const tick = () => {
      void load(ac.signal).catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Journal inaccessible");
      });
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [load]);

  const openFolder = async () => {
    setOpening(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open-folder" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Impossible d’ouvrir le dossier");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dossier inaccessible");
    } finally {
      setOpening(false);
    }
  };

  const spikes = (() => {
    const byAt = new Map<number, HudFrame>();
    for (const row of data?.disk ?? []) byAt.set(row.at, row);
    for (const row of data?.sessionSpikes ?? []) byAt.set(row.at, row);
    return [...byAt.values()].sort((a, b) => b.at - a.at);
  })();
  const rows = spikes;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">
          Chaque spike de ping est loggé avec CPU, RAM, GPU et le process le plus
          probable. Session en mémoire, historique dans{" "}
          <span className="font-mono text-zinc-500">{data?.dir ?? "…"}</span>
        </p>
        <Button size="sm" variant="outline" onClick={() => void openFolder()} disabled={opening}>
          <FolderOpenIcon />
          Ouvrir le dossier
        </Button>
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Pas encore de spike. Laisse la veille tourner pendant une partie.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="pb-2 pr-3 font-medium">Heure</th>
                <th className="pb-2 pr-3 font-medium">Ping</th>
                <th className="pb-2 pr-3 font-medium">Δ</th>
                <th className="pb-2 pr-3 font-medium">Suspect</th>
                <th className="pb-2 pr-3 font-medium">CPU</th>
                <th className="pb-2 pr-3 font-medium">RAM</th>
                <th className="pb-2 pr-3 font-medium">GPU</th>
                <th className="pb-2 font-medium">Réseau</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const delta =
                  row.rttMs != null && row.baselineMs != null
                    ? row.rttMs - row.baselineMs
                    : null;
                return (
                  <tr key={row.at} className="border-t border-white/5 align-top">
                    <td className="py-2 pr-3 font-mono text-zinc-500">{fmtTime(row.at)}</td>
                    <td className="py-2 pr-3 font-mono text-rose-200">{formatMs(row.rttMs, 0)}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-400">
                      {delta == null ? "—" : `+${Math.round(delta)}`}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-zinc-200">{row.suspect?.label ?? "—"}</div>
                      <div className="max-w-md text-xs text-zinc-500">{row.suspect?.reason}</div>
                    </td>
                    <td className="py-2 pr-3 font-mono text-zinc-400">{metric(row.cpuPct, "%")}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-400">{metric(row.memPct, "%")}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-400">{metric(row.gpuPct, "%")}</td>
                    <td className="py-2 font-mono text-zinc-400">
                      {row.rxMbps == null && row.txMbps == null
                        ? "—"
                        : `↓${row.rxMbps?.toFixed(1) ?? "—"} ↑${row.txMbps?.toFixed(1) ?? "—"}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows[0]?.top?.length ? (
        <p className={cn("text-xs text-zinc-600")}>
          Dernier top process : {rows[0].top.slice(0, 4).map((p) => `${p.label} ${p.cpu.toFixed(0)}%`).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
