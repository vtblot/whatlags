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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FindingsList } from "@/components/findings-list";
import { HopPath } from "@/components/hop-path";
import { LatencyChart, type ChartPoint } from "@/components/latency-chart";
import { OverlayLaunchButton } from "@/components/game-overlay";
import { JournalPanel } from "@/components/journal-panel";
import { TargetPicker } from "@/components/target-picker";
import { StatsRow } from "@/components/stats-row";
import { GuideTab } from "@/components/guide-tab";
import { EmptyTab } from "@/components/empty-tab";
import { useWatch } from "@/hooks/use-watch";
import { analyze } from "@/lib/analyze";
import { probeHttp, readConnectionHint, type ConnectionHint } from "@/lib/browser-probe";
import { BROWSER_HTTP_TARGETS } from "@/lib/targets";
import { formatMs, latencyTone, summarizePing } from "@/lib/stats";
import { isValidTarget, normalizeTarget } from "@/lib/host";
import {
  CHART_MAX_POINTS,
  HTTP_PROBE_COUNT,
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
import type { SpikeSensitivity } from "@/lib/suspects";
import {
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  RadarIcon,
  RouteIcon,
} from "lucide-react";

let cachedHint: ConnectionHint | null | undefined;

type Phase = "idle" | "suite" | "done";
type Intent = "play" | "diagnose";

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

export function WhatLagsApp() {
  const [intent, setIntent] = useState<Intent>("play");
  const [tab, setTab] = useState("journal");
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
  const [bloatArmed, setBloatArmed] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const hint = useSyncExternalStore(
    () => () => {},
    getConnectionHintSnapshot,
    () => null,
  );
  const httpSamples = useRef<PingSample[]>([]);
  const lastFrameAt = useRef(0);

  const activeHost = normalizeTarget(custom.trim() || target);
  const {
    watch,
    autostart,
    peerHint,
    toggleWatch,
    setSensitivity,
    toggleAutostart,
    detectPeer,
  } = useWatch(activeHost);

  const diagnosis: Diagnosis | null = useMemo(() => {
    if (pings.length === 0) return null;
    return analyze({
      pings,
      traceroute,
      dns,
      bufferbloat,
      gateway,
      origin: "local",
    });
  }, [pings, traceroute, dns, bufferbloat, gateway]);

  const pushChartPoints = useCallback((points: ChartPoint[]) => {
    setChart((prev) => [...prev, ...points].slice(-CHART_MAX_POINTS));
  }, []);

  useEffect(() => {
    const frame = watch?.latest;
    if (!frame || frame.at === lastFrameAt.current) return;
    lastFrameAt.current = frame.at;
    const t = frame.at;
    pushChartPoints([
      {
        t,
        label: new Date(t).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        icmp: frame.rttMs,
        http: null,
      },
    ]);
    setLiveIcmp((prev) => {
      const samples = [
        ...(prev?.samples ?? []),
        {
          seq: (prev?.samples.length ?? 0) + 1,
          rttMs: frame.rttMs,
          at: t,
        },
      ].slice(-LIVE_SAMPLE_CAP);
      return summarizePing({
        target: frame.target,
        method: frame.method === "tcp" ? "tcp" : "icmp",
        samples,
      });
    });
  }, [pushChartPoints, watch?.latest]);

  const runSuite = useCallback(async () => {
    const host = normalizeTarget(custom.trim() || target);
    if (!isValidTarget(host)) {
      setError("Cible invalide.");
      return;
    }
    setError(null);
    setNotice(null);
    setPhase("suite");
    setPings([]);
    setTraceroute(null);
    setDns([]);
    setBufferbloat(null);
    setChart([]);
    httpSamples.current = [];
    lastFrameAt.current = 0;

    const extras = ["1.1.1.1", "8.8.8.8"].filter((h) => h !== host);
    const gameRunning = watch?.gameRunning ?? false;
    const skipBloat = gameRunning && !bloatArmed;

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

      if (skipBloat) {
        setNotice(
          "Bufferbloat ignoré : un jeu tourne. Relance le diagnostic pour saturer la ligne ~6 s.",
        );
        setBloatArmed(true);
      } else {
        setStep("Bufferbloat (charge courte)…");
        const bloat = await fetchJson<BufferbloatResult>(
          `/api/bufferbloat?target=${encodeURIComponent(host)}`,
        );
        setBufferbloat(bloat);
        setBloatArmed(false);
      }

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
      setIntent("diagnose");
      setTab("causes");
    } catch (err) {
      setStep(null);
      setError(err instanceof Error ? err.message : "Le diagnostic a échoué.");
      setPhase(pings.length ? "done" : "idle");
    }
  }, [bloatArmed, custom, pings.length, pushChartPoints, target, watch?.gameRunning]);

  const onDiagnoseClick = () => {
    setIntent("diagnose");
    setTab("causes");
    void runSuite();
  };

  const onDetectPeer = async () => {
    setDetecting(true);
    setError(null);
    try {
      const peer = await detectPeer();
      if (peer) {
        setCustom(peer.ip);
        setNotice(`Cible = peer UDP ${peer.process} (${peer.ip}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Détection impossible.");
    } finally {
      setDetecting(false);
    }
  };

  const primary = pings[0] ?? liveIcmp;
  const busy = phase === "suite";
  const latest = watch?.latest ?? null;
  const sensitivity: SpikeSensitivity = watch?.sensitivity ?? "normal";

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
            {intent === "play"
              ? "La veille ping en fond pendant la partie. Chaque spike est croisé avec CPU, RAM, GPU et process."
              : "On mesure le plancher, le jitter, les pertes, le DNS, le chemin et le bufferbloat — puis on pointe une cause."}
          </p>
        </div>
        {latest?.spike ? (
          <button
            type="button"
            onClick={() => {
              setIntent("play");
              setTab("journal");
            }}
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-right"
          >
            <div className="font-mono text-[11px] tracking-widest text-rose-300/80 uppercase">
              Spike veille
            </div>
            <div className="font-mono text-4xl text-rose-200">
              {latest.rttMs == null ? "perte" : `${Math.round(latest.rttMs)}`}
            </div>
            <div className="max-w-[16rem] text-xs text-rose-100/80">
              {latest.suspect?.label ?? "sans process évident"}
              {" — journal"}
            </div>
          </button>
        ) : diagnosis && intent === "diagnose" ? (
          <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 px-5 py-4 text-right">
            <div className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">
              Score ligne
            </div>
            <div className="font-mono text-4xl text-teal-300">{diagnosis.score}</div>
            <div className="max-w-[16rem] text-xs text-zinc-400">{diagnosis.headline}</div>
          </div>
        ) : latest ? (
          <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 px-5 py-4 text-right">
            <div className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase">
              Veille
            </div>
            <div className={`font-mono text-4xl ${toneClass(latest.rttMs)}`}>
              {latest.rttMs == null ? "—" : Math.round(latest.rttMs)}
            </div>
            <div className="max-w-[16rem] text-xs text-zinc-400">
              {latest.target}
              {latest.loss ? " · perte ICMP (pas encore un spike)" : " · ligne calme"}
            </div>
          </div>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={intent === "play" ? "default" : "outline"}
          onClick={() => {
            setIntent("play");
            setTab("journal");
          }}
        >
          Je joue
        </Button>
        <Button
          variant={intent === "diagnose" ? "default" : "outline"}
          onClick={() => {
            setIntent("diagnose");
            setTab("causes");
          }}
        >
          Je diagnostique
        </Button>
      </div>

      <Alert className="border-amber-500/20 bg-amber-500/5">
        <AlertTitle>
          {intent === "play" ? "Pendant une partie" : "Hors ranked"}
        </AlertTitle>
        <AlertDescription>
          {intent === "play"
            ? "Laisse la veille ON, ouvre l’overlay, passe le jeu en fenêtré sans bordure. Le graphe ci-dessous lit la veille — pas un second ping."
            : "Le diagnostic complet charge un peu la ligne (~6 s de bufferbloat). Pas pendant une ranked."}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Cible</CardTitle>
          <CardDescription>
            1.1.1.1 est une référence anycast, pas ton serveur de jeu. Survole un
            preset, ou détecte le peer UDP du client.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TargetPicker
            target={target}
            custom={custom}
            onTarget={(host) => {
              setTarget(host);
              setCustom("");
            }}
            onCustom={setCustom}
            onDetectPeer={() => void onDetectPeer()}
            detecting={detecting}
            peerHint={peerHint}
          />
          <div className="flex flex-wrap gap-2">
            {intent === "diagnose" || bloatArmed ? (
              <Button onClick={onDiagnoseClick} disabled={busy} size="lg">
                {phase === "suite" ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <RouteIcon />
                )}
                {watch?.gameRunning && !bloatArmed
                  ? "Diagnostic (sans bloat)"
                  : bloatArmed
                    ? "Confirmer bufferbloat + diagnostic"
                    : "Diagnostic complet"}
              </Button>
            ) : null}
            <OverlayLaunchButton
              target={activeHost}
              disabled={!isValidTarget(activeHost)}
            />
            <Button
              variant="outline"
              size="lg"
              onClick={() => void toggleWatch().catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Veille impossible.");
              })}
              disabled={!isValidTarget(activeHost)}
            >
              {watch?.running ? <EyeIcon /> : <EyeOffIcon />}
              {watch?.running ? "Veille ON" : "Veille OFF"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>Seuil spikes</span>
            {(["sensitive", "normal", "calm"] as const).map((s) => (
              <Button
                key={s}
                size="xs"
                variant={sensitivity === s ? "default" : "outline"}
                onClick={() => void setSensitivity(s)}
              >
                {s === "sensitive" ? "Sensible" : s === "calm" ? "Calme" : "Normal"}
              </Button>
            ))}
            <Button
              size="xs"
              variant={autostart ? "default" : "outline"}
              onClick={() =>
                void toggleAutostart().catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Autostart impossible.");
                })
              }
            >
              {autostart ? "Démarrage Windows ON" : "Démarrer avec Windows"}
            </Button>
          </div>
          {step ? (
            <p className="flex items-center gap-2 font-mono text-xs text-teal-300">
              <LoaderCircleIcon className="size-3.5 animate-spin" />
              {step}
            </p>
          ) : null}
          {notice ? <p className="text-sm text-teal-200/90">{notice}</p> : null}
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {watch?.latest ? (
            <p className="text-xs text-zinc-500">
              Veille {watch.running ? "active" : "en pause"} · {watch.target} ·{" "}
              {watch.latest.rttMs == null ? "—" : `${Math.round(watch.latest.rttMs)} ms`}
              {watch.latest.spike && watch.latest.suspect
                ? ` · spike ${watch.latest.suspect.label}`
                : watch.latest.loss
                  ? " · perte"
                  : ""}
            </p>
          ) : null}
          {hint ? (
            <p className="text-xs text-zinc-500">
              Navigateur : {hint.effectiveType ?? "réseau inconnu"}
              {hint.downlink != null ? ` · ~${hint.downlink} Mb/s` : ""}
              {hint.rtt != null ? ` · RTT estimé API ${hint.rtt} ms` : ""}
              {gateway?.gateway
                ? ` · passerelle ${gateway.gateway} (${gateway.interface})`
                : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <StatsRow primary={primary} />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Oscillo latence</CardTitle>
          <CardDescription>
            Cyan = ICMP/TCP de la veille (1 / 2 s). Ambre = HTTP navigateur (au
            diagnostic). Pas de second ping pendant que tu joues.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chart.length === 0 ? (
            <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-zinc-400">
                La veille alimente cette courbe. Laisse-la ON pendant une partie,
                ou lance un diagnostic pour croiser traceroute, DNS et charge.
              </p>
            </div>
          ) : (
            <LatencyChart data={chart} />
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(value) => { if (value) setTab(value); }}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="causes">Causes</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="cibles">Cibles</TabsTrigger>
          <TabsTrigger value="route">Route</TabsTrigger>
          <TabsTrigger value="dns">DNS</TabsTrigger>
          <TabsTrigger value="bloat">Bufferbloat</TabsTrigger>
          <TabsTrigger value="guide">Guide</TabsTrigger>
        </TabsList>

        <TabsContent value="causes" className="pt-4">
          {phase === "suite" ? (
            <p className="text-sm text-zinc-400">Analyse en cours — {step}</p>
          ) : diagnosis ? (
            <FindingsList findings={diagnosis.findings} />
          ) : (
            <EmptyTab onDiagnose={onDiagnoseClick}>
              Les causes scorées viennent du diagnostic, pas de la veille. Le
              journal (onglet à côté) raconte déjà les spikes in-game.
            </EmptyTab>
          )}
        </TabsContent>

        <TabsContent value="journal" className="pt-4">
          <JournalPanel />
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
                      <div>perte {formatPctSafe(p.lossPct)}</div>
                    </CardContent>
                  </Card>
                ) : null,
            )}
            {pings.length === 0 && !liveIcmp ? (
              <EmptyTab>La veille n’a pas encore de RTT. Vérifie que ping ICMP n’est pas bloqué.</EmptyTab>
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
            <EmptyTab onDiagnose={onDiagnoseClick}>
              Le traceroute n’a pas encore été lancé (diagnostic).
            </EmptyTab>
          )}
        </TabsContent>

        <TabsContent value="dns" className="pt-4">
          {dns.length === 0 ? (
            <EmptyTab onDiagnose={onDiagnoseClick}>
              Pas encore de mesures DNS. Elles n’influencent pas le ping en round,
              mais le temps d’entrer en partie / charger une map.
            </EmptyTab>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Résolutions DNS</caption>
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">Nom</th>
                    <th scope="col" className="pb-2 font-medium">Temps</th>
                    <th scope="col" className="pb-2 font-medium">Adresse</th>
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
                  {" · "}{bufferbloat.target}
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                On ping la cible au repos, puis pendant un téléchargement Cloudflare.
                Si le ping s’envole, la box met trop de paquets en file.
              </p>
            </div>
          ) : (
            <EmptyTab onDiagnose={onDiagnoseClick}>
              Pas encore de test sous charge. Il tourne dans le diagnostic — pas
              pendant une ranked.
            </EmptyTab>
          )}
        </TabsContent>

        <TabsContent value="guide" className="pt-4">
          <GuideTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatPctSafe(n: number): string {
  return `${n.toLocaleString("fr-FR", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })} %`;
}
