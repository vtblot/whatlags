"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FindingsList } from "@/components/findings-list";
import { HopPath } from "@/components/hop-path";
import { LatencyChart, type ChartPoint } from "@/components/latency-chart";
import { OverlayLaunchButton } from "@/components/game-overlay";
import { analyze } from "@/lib/analyze";
import { probeHttp, readConnectionHint, type ConnectionHint } from "@/lib/browser-probe";
import { BROWSER_HTTP_TARGETS, PRESET_TARGETS } from "@/lib/targets";
import { formatMs, formatPct, latencyTone, summarizePing } from "@/lib/stats";
import { isValidTarget, normalizeTarget } from "@/lib/host";
import {
  CHART_MAX_POINTS,
  HTTP_PROBE_COUNT,
  LIVE_INTERVAL_MS,
  LIVE_MAX_MS,
  LIVE_SAMPLE_CAP,
  PING_BURST_COUNT,
} from "@/lib/budget";
import type {
  BufferbloatResult,
  Diagnosis,
  DnsResult,
  GatewayInfo,
  PingSample,
  PingSummary,
  TracerouteResult,
} from "@/lib/types";
import {
  ActivityIcon,
  LoaderCircleIcon,
  RadarIcon,
  RouteIcon,
  SquareIcon,
} from "lucide-react";

let cachedHint: ConnectionHint | null | undefined;

type Phase = "idle" | "live" | "suite" | "done";

function getConnectionHintSnapshot(): ConnectionHint | null {
  if (cachedHint === undefined) {
    cachedHint = readConnectionHint();
  }
  return cachedHint;
}

function toneClass(ms: number | null): string {
  const t = latencyTone(ms);
  if (t === "good") return "text-teal-300";
  if (t === "ok") return "text-lime-300";
  if (t === "playable") return "text-amber-300";
  if (t === "bad") return "text-rose-300";
  return "text-zinc-500";
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return data;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function WhatLagsApp() {
  const [target, setTarget] = useState("1.1.1.1");
  const [custom, setCustom] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [pings, setPings] = useState<PingSummary[]>([]);
  const [traceroute, setTraceroute] = useState<TracerouteResult | null>(null);
  const [dns, setDns] = useState<DnsResult[]>([]);
  const [bufferbloat, setBufferbloat] = useState<BufferbloatResult | null>(null);
  const [gateway, setGateway] = useState<GatewayInfo | null>(null);
  const [liveIcmp, setLiveIcmp] = useState<PingSummary | null>(null);
  const [liveHttp, setLiveHttp] = useState<PingSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hint = useSyncExternalStore(
    () => () => {},
    getConnectionHintSnapshot,
    () => null,
  );
  const liveRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const httpSamples = useRef<PingSample[]>([]);

  const diagnosis: Diagnosis | null = useMemo(() => {
    if (pings.length === 0) return null;
    return analyze({
      pings,
      traceroute,
      dns,
      bufferbloat,
      gateway,
      origin: "server",
    });
  }, [pings, traceroute, dns, bufferbloat, gateway]);

  useEffect(() => {
    return () => {
      liveRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const pushChartPoints = useCallback((points: ChartPoint[]) => {
    setChart((prev) => [...prev, ...points].slice(-CHART_MAX_POINTS));
  }, []);

  const stopLive = useCallback((reason?: string) => {
    liveRef.current = false;
    abortRef.current?.abort();
    if (reason) setNotice(reason);
    setPhase((p) => (p === "live" ? (pings.length ? "done" : "idle") : p));
  }, [pings.length]);

  const tickLive = useCallback(async (signal: AbortSignal) => {
    const host = normalizeTarget(custom.trim() || target);
    const icmpRes = await fetchJson<PingSummary>(
      `/api/ping?target=${encodeURIComponent(host)}&count=1`,
      signal,
    );
    const icmp = icmpRes.samples[0]?.rttMs ?? null;
    const t = Date.now();
    pushChartPoints([
      {
        t,
        label: new Date(t).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        icmp,
        http: null,
      },
    ]);

    setLiveIcmp((prev) => {
      const samples = [
        ...(prev?.samples ?? []),
        icmpRes.samples[0] ?? {
          seq: (prev?.samples.length ?? 0) + 1,
          rttMs: null,
          at: t,
        },
      ].slice(-LIVE_SAMPLE_CAP);
      return summarizePing({
        target: host,
        method: icmpRes.method,
        samples,
        resolvedIp: icmpRes.resolvedIp,
      });
    });
  }, [custom, pushChartPoints, target]);

  const startLive = useCallback(async () => {
    const host = normalizeTarget(custom.trim() || target);
    if (!isValidTarget(host)) {
      setError("Cible invalide.");
      return;
    }
    setError(null);
    setNotice(null);
    setPhase("live");
    liveRef.current = true;
    const ac = new AbortController();
    abortRef.current = ac;
    const started = Date.now();

    while (liveRef.current) {
      try {
        if (typeof document !== "undefined" && document.hidden) {
          await sleep(500, ac.signal);
          continue;
        }
        if (Date.now() - started >= LIVE_MAX_MS) {
          stopLive("Live arrêté après 3 min pour ménager CPU et RAM.");
          return;
        }
        await tickLive(ac.signal);
        await sleep(LIVE_INTERVAL_MS, ac.signal);
      } catch (err) {
        if (isAbort(err) || !liveRef.current) return;
        setError(err instanceof Error ? err.message : "Mesure live interrompue.");
        liveRef.current = false;
        setPhase("idle");
        return;
      }
    }
  }, [custom, stopLive, target, tickLive]);

  const runSuite = useCallback(async () => {
    const host = normalizeTarget(custom.trim() || target);
    if (!isValidTarget(host)) {
      setError("Cible invalide.");
      return;
    }
    liveRef.current = false;
    abortRef.current?.abort();
    setError(null);
    setNotice(null);
    setPhase("suite");
    setPings([]);
    setTraceroute(null);
    setDns([]);
    setBufferbloat(null);
    setChart([]);
    httpSamples.current = [];

    const extras = ["1.1.1.1", "8.8.8.8"].filter((h) => h !== host);

    try {
      setStep("Passerelle locale…");
      const gw = await fetchJson<GatewayInfo>("/api/gateway");
      setGateway(gw);

      setStep(`Ping ${host} + références…`);
      const burst: PingSummary[] = [];
      for (const h of [host, ...extras]) {
        burst.push(
          await fetchJson<PingSummary>(
            `/api/ping?target=${encodeURIComponent(h)}&count=${PING_BURST_COUNT}`,
          ),
        );
      }
      setPings(burst);
      const now = Date.now();
      pushChartPoints(
        (burst[0]?.samples ?? []).map((sample, i) => ({
          t: now + i,
          label: `#${sample.seq}`,
          icmp: sample.rttMs,
          http: null,
        })),
      );

      setStep("Traceroute…");
      const trace = await fetchJson<TracerouteResult>(
        `/api/traceroute?target=${encodeURIComponent(host)}`,
      );
      setTraceroute(trace);

      setStep("Résolution DNS…");
      const dnsRows = await fetchJson<DnsResult[]>("/api/dns");
      setDns(dnsRows);

      setStep("Bufferbloat (charge courte)…");
      const bloat = await fetchJson<BufferbloatResult>(
        `/api/bufferbloat?target=${encodeURIComponent("1.1.1.1")}`,
      );
      setBufferbloat(bloat);

      setStep("Sondes navigateur…");
      const httpPoints: ChartPoint[] = [];
      for (let i = 0; i < HTTP_PROBE_COUNT; i++) {
        const http = await probeHttp(BROWSER_HTTP_TARGETS[0].url);
        httpSamples.current.push({
          seq: i + 1,
          rttMs: http,
          at: Date.now(),
        });
        httpPoints.push({
          t: Date.now(),
          label: `http ${i + 1}`,
          icmp: null,
          http,
        });
      }
      pushChartPoints(httpPoints);
      setLiveHttp(
        summarizePing({
          target: "cloudflare.com (HTTP)",
          method: "http",
          samples: httpSamples.current,
        }),
      );

      setStep(null);
      setPhase("done");
    } catch (err) {
      setStep(null);
      setError(err instanceof Error ? err.message : "Le diagnostic a échoué.");
      setPhase(pings.length ? "done" : "idle");
    }
  }, [custom, pings.length, pushChartPoints, target]);

  const primary = pings[0] ?? liveIcmp;
  const busy = phase === "suite" || phase === "live";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-teal-300">
            <RadarIcon className="size-5" />
            <span className="font-mono text-xs tracking-[0.22em] uppercase">
              WhatLags
            </span>
          </div>
          <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            Pourquoi ton ping saute — et à quel étage.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
            Un chiffre de ping ne dit rien. On mesure le plancher, le jitter, les
            pertes, le DNS, le chemin (traceroute) et le bufferbloat — puis on
            pointe une cause probable : Wi‑Fi, box, FAI, peering ou serveur.
          </p>
        </div>
        {diagnosis ? (
          <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 px-5 py-4 text-right">
            <div className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">
              Score ligne
            </div>
            <div className="font-mono text-4xl text-teal-300">{diagnosis.score}</div>
            <div className="max-w-[16rem] text-xs text-zinc-400">{diagnosis.headline}</div>
          </div>
        ) : null}
      </header>

      <Alert className="border-amber-500/20 bg-amber-500/5">
        <AlertTitle>Où se prend la mesure · charge PC</AlertTitle>
        <AlertDescription>
          ICMP / traceroute partent de <strong>la machine qui exécute l’app</strong>.
          Pour diagnostiquer <em>ton</em> Wi‑Fi, lance WhatLags sur le PC de jeu.
          Le live est léger (1 ping / 2 s, pause si l’onglet est caché, stop auto
          à 3 min). L’<strong>overlay jeu</strong> reste ouvert pendant une partie
          et nomme le process le plus probable au moment d’un spike (Steam, Discord,
          navigateur…). Le diagnostic complet charge un peu la ligne ~6 s : pas en ranked.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Cible</CardTitle>
          <CardDescription>
            1.1.1.1 sert de référence propre. Ajoute un hostname de jeu pour voir
            si le lag est “partout” ou seulement vers cet éditeur.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {PRESET_TARGETS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={target === p.host && !custom ? "default" : "outline"}
                onClick={() => {
                  setTarget(p.host);
                  setCustom("");
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Hôte perso — ex. 192.168.1.1 ou eu.actual.battle.net"
              className="font-mono"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={runSuite} disabled={busy} size="lg">
                {phase === "suite" ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <RouteIcon />
                )}
                Diagnostic complet
              </Button>
              {phase === "live" ? (
                <Button variant="outline" size="lg" onClick={() => stopLive()}>
                  <SquareIcon />
                  Stop
                </Button>
              ) : (
                <Button variant="outline" size="lg" onClick={startLive} disabled={busy}>
                  <ActivityIcon />
                  Live
                </Button>
              )}
              <OverlayLaunchButton
                target={normalizeTarget(custom.trim() || target)}
                disabled={!isValidTarget(custom.trim() || target)}
              />
            </div>
          </div>
          {step ? (
            <p className="flex items-center gap-2 font-mono text-xs text-teal-300">
              <LoaderCircleIcon className="size-3.5 animate-spin" />
              {step}
            </p>
          ) : null}
          {notice ? <p className="text-sm text-teal-200/90">{notice}</p> : null}
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {hint ? (
            <p className="text-xs text-zinc-500">
              Navigateur : {hint.effectiveType ?? "réseau inconnu"}
              {hint.downlink != null ? ` · ~${hint.downlink} Mb/s` : ""}
              {hint.rtt != null ? ` · RTT estimé API ${hint.rtt} ms` : ""}
              {gateway?.gateway
                ? ` · passerelle serveur ${gateway.gateway} (${gateway.interface})`
                : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-4">
        <Stat
          label="Ping moyen"
          value={formatMs(primary?.avgMs ?? null)}
          className={toneClass(primary?.avgMs ?? null)}
          hint={primary ? `${primary.method.toUpperCase()} · ${primary.target}` : "—"}
        />
        <Stat
          label="Jitter"
          value={formatMs(primary?.jitterMs ?? null)}
          className={toneClass(primary?.jitterMs != null ? primary.jitterMs * 3 : null)}
          hint="variation d’un ping à l’autre"
        />
        <Stat
          label="Min / max"
          value={`${formatMs(primary?.minMs ?? null, 0)} / ${formatMs(primary?.maxMs ?? null, 0)}`}
          hint="plancher vs spike"
        />
        <Stat
          label="Pertes"
          value={primary ? formatPct(primary.lossPct) : "—"}
          className={
            primary && primary.lossPct >= 2 ? "text-rose-300" : "text-teal-300"
          }
          hint={
            primary
              ? `${primary.received}/${primary.transmitted} reçus`
              : "échantillons"
          }
        />
      </section>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Oscillo latence</CardTitle>
          <CardDescription>
            Cyan = ICMP/TCP. Ambre = HTTP navigateur (au diagnostic). La courbe
            se dessine à chaque salve ; le live reste à 1 ping / 2 s.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {phase === "idle" && chart.length === 0 ? (
            <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-zinc-400">
                Lance un live pour voir le ping bouger, ou un diagnostic pour
                croiser traceroute, DNS et charge.
              </p>
            </div>
          ) : (
            <LatencyChart data={chart} />
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="causes">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="causes">Causes</TabsTrigger>
          <TabsTrigger value="cibles">Cibles</TabsTrigger>
          <TabsTrigger value="route">Route</TabsTrigger>
          <TabsTrigger value="dns">DNS</TabsTrigger>
          <TabsTrigger value="bloat">Bufferbloat</TabsTrigger>
          <TabsTrigger value="guide">Guide</TabsTrigger>
        </TabsList>

        <TabsContent value="causes" className="pt-4">
          {phase === "suite" ? (
            <p className="text-sm text-zinc-400">Analyse en cours — {step}</p>
          ) : (
            <FindingsList findings={diagnosis?.findings ?? []} />
          )}
        </TabsContent>

        <TabsContent value="cibles" className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {(pings.length ? pings : [liveIcmp, liveHttp].filter(Boolean)).map(
              (p) =>
                p ? (
                  <Card key={`${p.target}-${p.method}`} size="sm">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2">
                        <span className="truncate">{p.target}</span>
                        <Badge variant="outline">{p.method}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {p.resolvedIp ? p.resolvedIp : "IP non résolue"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2 font-mono text-sm">
                      <div>
                        moy.{" "}
                        <span className={toneClass(p.avgMs)}>{formatMs(p.avgMs)}</span>
                      </div>
                      <div>jitter {formatMs(p.jitterMs)}</div>
                      <div>
                        {formatMs(p.minMs)} – {formatMs(p.maxMs)}
                      </div>
                      <div>perte {formatPct(p.lossPct)}</div>
                    </CardContent>
                  </Card>
                ) : null,
            )}
            {pings.length === 0 && !liveIcmp ? (
              <p className="text-sm text-muted-foreground">Pas encore de cibles mesurées.</p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="route" className="pt-4">
          {traceroute ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                Vers {traceroute.target}. Un saut <span className="font-mono">*</span>{" "}
                ignore souvent ICMP : ce n’est pas forcément une panne.
              </p>
              <HopPath hops={traceroute.hops} />
              {traceroute.error ? (
                <p className="text-sm text-rose-300">{traceroute.error}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Le traceroute n’a pas encore été lancé (diagnostic complet).
            </p>
          )}
        </TabsContent>

        <TabsContent value="dns" className="pt-4">
          {dns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Pas encore de mesures DNS. Elles n’influencent pas le ping en round,
              mais le temps d’entrer en partie / charger une map.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="pb-2 font-medium">Nom</th>
                    <th className="pb-2 font-medium">Temps</th>
                    <th className="pb-2 font-medium">Adresse</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {dns.map((d) => (
                    <tr key={d.name} className="border-t border-white/5">
                      <td className="py-2">{d.name}</td>
                      <td className={toneClass(d.durationMs)}>{formatMs(d.durationMs)}</td>
                      <td className="text-zinc-400">
                        {d.error ?? d.addresses[0] ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="bloat" className="pt-4">
          {bufferbloat ? (
            <div className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="font-mono text-5xl text-teal-300">{bufferbloat.grade}</div>
                <div className="text-sm text-zinc-400">
                  Idle {formatMs(bufferbloat.idleAvgMs)} → sous charge{" "}
                  {formatMs(bufferbloat.loadedAvgMs)} (Δ {formatMs(bufferbloat.deltaMs)})
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                On ping 1.1.1.1 au repos, puis pendant un téléchargement Cloudflare.
                Si le ping s’envole, la box met trop de paquets en file : dès que
                quelqu’un stream, tes ranked meurent. Le test télécharge ~6 Mo en
                les jetant au fil de l’eau (pas de gros buffer RAM), puis s’arrête.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pas encore de test sous charge. Il tourne dans le diagnostic complet.
            </p>
          )}
        </TabsContent>

        <TabsContent value="guide" className="pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <GuideCard
              title="Ping"
              body="Aller-retour (RTT). En jeu c’est souvent UDP, ici ICMP ou TCP : assez proche pour diagnostiquer la ligne, pas un serveur CS précis."
            />
            <GuideCard
              title="Jitter"
              body="Écart entre deux pings. C’est ça le “ping variable”. Un min à 20 et un max à 120 se joue beaucoup plus mal qu’un plat à 45."
            />
            <GuideCard
              title="Pertes"
              body="Paquets jamais arrivés. 1 % se sent. Wi‑Fi, câble pourri, ou un saut FAI qui drop."
            />
            <GuideCard
              title="Bufferbloat"
              body="Debit OK, ping horrible dès qu’il y a du trafic. File d’attente trop longue sur la box / le FAI."
            />
            <GuideCard
              title="Overlay jeu"
              body="Mini HUD au-dessus du jeu : ping + le process qui coincidait avec le spike. Ça n’injecte rien dans le jeu (anti-cheat safe). Plein écran exclusif la recouvre — utilise le fenêtré sans bordure et épingle la fenêtre."
            />
            <GuideCard
              title="Ce que ça ne voit pas"
              body="Tickrate du serveur, interpolation du client, hitreg, FPS, overlay Discord. Si le score ligne est vert et que ça lag encore, cherche de ce côté."
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
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

function GuideCard({ title, body }: { title: string; body: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="leading-6 text-zinc-400">{body}</CardContent>
    </Card>
  );
}
