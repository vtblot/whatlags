"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OVERLAY_HISTORY, OVERLAY_INTERVAL_MS } from "@/lib/overlay-budget";
import type { HudFrame } from "@/lib/suspects";
import { PictureInPicture2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function pingTone(ms: number | null, spike: boolean): string {
  if (ms == null || spike) return "text-rose-300";
  if (ms < 30) return "text-teal-300";
  if (ms < 50) return "text-lime-300";
  if (ms < 80) return "text-amber-300";
  return "text-rose-300";
}

function Spark({ values }: { values: Array<number | null> }) {
  const w = 360;
  const h = 36;
  const nums = values.filter((v): v is number => v != null);
  const max = Math.max(80, ...nums, 1);
  const step = values.length <= 1 ? 0 : w / (values.length - 1);
  let d = "";
  let drawing = false;
  values.forEach((v, i) => {
    if (v == null) {
      drawing = false;
      return;
    }
    const x = i * step;
    const y = h - (Math.min(v, max) / max) * h;
    d += drawing ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    drawing = true;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" aria-hidden>
      <path d={d} fill="none" stroke="#5eead4" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

export function GameOverlay({
  target,
  showFloatHint = false,
}: {
  target: string;
  showFloatHint?: boolean;
}) {
  const [frame, setFrame] = useState<HudFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const history = useRef<Array<number | null>>([]);
  const [spark, setSpark] = useState<Array<number | null>>([]);
  const [events, setEvents] = useState<Array<{ t: string; text: string }>>([]);
  const lastSuspect = useRef<string>("");

  const tick = useCallback(async (signal: AbortSignal) => {
    const res = await fetch("/api/hud", {
      cache: "no-store",
      signal,
    });
    const data = (await res.json()) as HudFrame & { error?: string; pending?: boolean };
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    if (data.pending || data.at == null) return;
    setFrame(data);
    history.current = [...history.current, data.rttMs].slice(-OVERLAY_HISTORY);
    setSpark(history.current);
    if (data.spike && data.suspect && data.suspect.name !== lastSuspect.current) {
      lastSuspect.current = data.suspect.name;
      const t = new Date(data.at).toLocaleTimeString("fr-FR", {
        minute: "2-digit",
        second: "2-digit",
      });
      setEvents((prev) =>
        [{ t, text: `${data.suspect!.label} — ${data.suspect!.reason}` }, ...prev].slice(0, 4),
      );
    }
    if (!data.spike) lastSuspect.current = "";
    setError(null);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;
    const loop = async () => {
      while (alive) {
        try {
          await tick(ac.signal);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : "HUD coupé");
        }
        await new Promise((r) => setTimeout(r, OVERLAY_INTERVAL_MS));
      }
    };
    void loop();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [tick]);

  const rtt = frame?.rttMs ?? null;

  return (
    <div
      className={cn(
        "w-[380px] rounded-xl border border-teal-500/20 bg-[#070a10]/92 p-3 text-zinc-200 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm",
        frame?.spike && "border-rose-400/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-teal-400/80 uppercase">
            WhatLags
          </div>
          <div className="text-[11px] text-zinc-500">{frame?.target ?? target}</div>
        </div>
        <div className={cn("font-mono text-4xl leading-none tabular-nums", pingTone(rtt, !!frame?.spike))}>
          {rtt == null ? "—" : Math.round(rtt)}
          <span className="ml-1 text-sm text-zinc-500">ms</span>
        </div>
      </div>

      <div className="mt-2">
        <Spark values={spark} />
      </div>

      <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-zinc-500">
        <span>↓ {frame?.rxMbps == null ? "…" : `${frame.rxMbps.toFixed(1)} Mb/s`}</span>
        <span>↑ {frame?.txMbps == null ? "…" : `${frame.txMbps.toFixed(1)} Mb/s`}</span>
        <span>CPU {frame?.cpuPct == null ? "…" : `${frame.cpuPct.toFixed(0)} %`}</span>
        <span>RAM {frame?.memPct == null ? "…" : `${frame.memPct.toFixed(0)} %`}</span>
        <span>GPU {frame?.gpuPct == null ? "…" : `${frame.gpuPct.toFixed(0)} %`}</span>
      </div>

      <div
        className={cn(
          "mt-2 rounded-lg px-2.5 py-2 text-sm leading-snug",
          frame?.spike ? "bg-rose-500/10 text-rose-100" : "bg-teal-500/8 text-zinc-300",
        )}
        aria-live="polite"
        role="status"
      >
        {frame?.spike && frame.suspect ? (
          <>
            <div className="font-medium text-rose-200">{frame.suspect.label}</div>
            <div className="text-[12px] text-rose-100/80">{frame.suspect.reason}</div>
          </>
        ) : (
          <div className="text-[12px] text-zinc-400">
            Ligne calme. Dès que le ping saute, on pointe le process le plus probable
            (Steam, Discord, navigateur, overlay…).
          </div>
        )}
      </div>

      {frame?.top?.length ? (
        <ol className="mt-2 space-y-0.5 font-mono text-[10px] text-zinc-500">
          {frame.top.slice(0, 4).map((p) => (
            <li key={`${p.pid}-${p.name}`} className="flex justify-between gap-2">
              <span className="truncate">{p.label}</span>
              <span>
                {p.cpu.toFixed(0)}% cpu
                {p.memPct >= 5 ? ` · ${p.memPct.toFixed(0)}% ram` : ""}
                {p.conns ? ` · ${p.conns} sock` : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {events.length > 0 ? (
        <ul className="mt-2 space-y-0.5 border-t border-white/5 pt-2 text-[10px] text-zinc-500">
          {events.map((e) => (
            <li key={e.t + e.text} className="truncate">
              <span className="text-zinc-600">{e.t}</span> {e.text}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-2 text-[11px] text-rose-300">{error}</p> : null}
      {showFloatHint ? (
        <p className="mt-2 text-[10px] leading-4 text-zinc-600">
          Plein écran exclusif cache cette fenêtre — passe le jeu en fenêtré
          sans bordure. Épingle-la au-dessus (PowerToys Always On Top).
        </p>
      ) : null}
    </div>
  );
}

function copyStyles(from: Document, to: Document) {
  to.documentElement.className = from.documentElement.className;
  to.body.style.margin = "0";
  to.body.style.background = "transparent";
  for (const node of from.querySelectorAll("link[rel='stylesheet'], style")) {
    to.head.appendChild(node.cloneNode(true));
  }
}

export async function openGameOverlay(target: string, allowLan = false) {
  const url = `/overlay?target=${encodeURIComponent(target)}${
    allowLan ? "&allowLan=1" : ""
  }`;
  const dpi = (
    window as Window & {
      documentPictureInPicture?: {
        requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window>;
      };
    }
  ).documentPictureInPicture;

  if (dpi) {
    try {
      const pip = await dpi.requestWindow({ width: 440, height: 420 });
      copyStyles(document, pip.document);
      const mount = pip.document.createElement("div");
      mount.style.padding = "8px";
      pip.document.body.append(mount);
      const root: Root = createRoot(mount);
      root.render(<GameOverlay target={target} showFloatHint />);
      pip.addEventListener("pagehide", () => root.unmount(), { once: true });
      return;
    } catch {
      /* popup fallback */
    }
  }

  window.open(
    url,
    "whatlags-overlay",
    "popup=yes,width=420,height=360,resizable=yes,scrollbars=no,status=no",
  );
}

export function OverlayLaunchButton({
  target,
  disabled,
  allowLan = false,
}: {
  target: string;
  disabled?: boolean;
  allowLan?: boolean;
}) {
  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      disabled={disabled}
      onClick={() => void openGameOverlay(target, allowLan)}
    >
      <PictureInPicture2Icon />
      Overlay jeu
    </Button>
  );
}
