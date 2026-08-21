export type ProcRow = {
  pid: number;
  name: string;
  label: string;
  cpu: number;
  memPct: number;
  conns: number;
  kind: "download" | "overlay" | "browser" | "game" | "sync" | "system" | "other";
};

export type Suspect = {
  label: string;
  name: string;
  reason: string;
  confidence: "low" | "medium" | "high";
  kind: ProcRow["kind"];
};

export type GamePeer = {
  ip: string;
  port: number | null;
  process: string;
  samples: number;
};

export type HudFrame = {
  at: number;
  target: string;
  rttMs: number | null;
  method: string;
  rxMbps: number | null;
  txMbps: number | null;
  cpuPct: number | null;
  memPct: number | null;
  gpuPct: number | null;
  vramPct: number | null;
  spike: boolean;
  loss?: boolean;
  baselineMs: number | null;
  top: ProcRow[];
  suspect: Suspect | null;
  peer?: GamePeer | null;
  note?: string;
};

export type SpikeSensitivity = "sensitive" | "normal" | "calm";

export const SPIKE_SENSITIVITY: Record<
  SpikeSensitivity,
  { minMarginMs: number; marginPct: number; floorMs: number; coldMs: number; lossStreak: number }
> = {
  sensitive: { minMarginMs: 18, marginPct: 0.5, floorMs: 30, coldMs: 55, lossStreak: 2 },
  normal: { minMarginMs: 25, marginPct: 0.8, floorMs: 40, coldMs: 80, lossStreak: 2 },
  calm: { minMarginMs: 40, marginPct: 1.2, floorMs: 55, coldMs: 110, lossStreak: 3 },
};

export type WatchStatus = {
  running: boolean;
  target: string;
  latest: HudFrame | null;
  sensitivity: SpikeSensitivity;
  gameRunning: boolean;
};

type CatalogEntry = {
  match: RegExp;
  label: string;
  kind: ProcRow["kind"];
};

const CATALOG: CatalogEntry[] = [
  { match: /steamwebhelper|steam/i, label: "Steam", kind: "download" },
  { match: /epicwebhelper|epicgames|fortnite/i, label: "Epic / Fortnite", kind: "download" },
  { match: /battle\.net|agent\.exe|blizzard/i, label: "Battle.net", kind: "download" },
  { match: /riotclient|league|valorant|vgc\.exe/i, label: "Riot", kind: "game" },
  { match: /\bcs2\b|csgo|deadlock/i, label: "Valve jeu", kind: "game" },
  { match: /overwatch/i, label: "Overwatch", kind: "game" },
  { match: /r5apex|apexlegends/i, label: "Apex", kind: "game" },
  { match: /discord/i, label: "Discord", kind: "overlay" },
  { match: /nvidia.*overlay|nvidia share|nvcontainer|nvidia app|geforce experience/i, label: "NVIDIA Overlay", kind: "overlay" },
  { match: /amd.?software|radeonsoftware|amdow/i, label: "AMD Overlay", kind: "overlay" },
  { match: /gamebar|xboxpcappfg|xboxapp|gamingservices/i, label: "Xbox Game Bar", kind: "overlay" },
  { match: /obs64|obs32|obs\.exe|streamlabs/i, label: "OBS", kind: "overlay" },
  { match: /easyanticheat|eac_/i, label: "Easy Anti-Cheat", kind: "system" },
  { match: /faceit/i, label: "FACEIT", kind: "overlay" },
  { match: /recoil/i, label: "Recoil", kind: "overlay" },
  { match: /icue|corsair/i, label: "iCUE", kind: "other" },
  { match: /lghub|logitech g/i, label: "Logitech G Hub", kind: "other" },
  { match: /chrome|chromium|msedge|brave|firefox|opera/i, label: "Navigateur", kind: "browser" },
  { match: /onedrive|dropbox|googledrivesync|resilio/i, label: "Sync cloud", kind: "sync" },
  { match: /qbittorrent|utorrent|transmission|deluge|aria2/i, label: "Torrent", kind: "download" },
  { match: /spotify|deezer/i, label: "Musique", kind: "other" },
  { match: /msmpeng|antimalware|avgui|avp|norton/i, label: "Antivirus", kind: "system" },
  { match: /usoclient|wuauclt|moUsoCoreWorker|windowsupdate/i, label: "Windows Update", kind: "download" },
  { match: /^node$|next-server|whatlags|causeping/i, label: "WhatLags", kind: "other" },
];

const IGNORE =
  /^(ps|ss|idle|system idle process|registry|memory compression|kthreadd|kworker|rcu_|migration|cpuhp|watchdog|irq\/|tini|pod-daemon|containerd|dockerd|pause)/i;

export function describeProcess(name: string): Pick<ProcRow, "label" | "kind"> {
  const hit = CATALOG.find((c) => c.match.test(name));
  if (hit) return { label: hit.label, kind: hit.kind };
  return { label: name.replace(/\.exe$/i, ""), kind: "other" };
}

export function shouldIgnoreProcess(name: string): boolean {
  return IGNORE.test(name.trim());
}

export function isSpike(
  rttMs: number | null,
  baselineMs: number | null,
  opts?: { sensitivity?: SpikeSensitivity; lossStreak?: number },
): boolean {
  const s = SPIKE_SENSITIVITY[opts?.sensitivity ?? "normal"];
  if (rttMs == null) {
    return (opts?.lossStreak ?? 0) >= s.lossStreak;
  }
  if (baselineMs == null) return rttMs >= s.coldMs;
  const margin = Math.max(s.minMarginMs, baselineMs * s.marginPct);
  return rttMs >= baselineMs + margin && rttMs >= s.floorMs;
}

export function hasGameProcess(top: ProcRow[]): boolean {
  return top.some((p) => p.kind === "game");
}

export function pickSuspect(input: {
  spike: boolean;
  rxMbps: number | null;
  txMbps: number | null;
  prevRxMbps: number | null;
  top: ProcRow[];
  prevTop: ProcRow[];
  gpuPct?: number | null;
  memPct?: number | null;
  prevMemPct?: number | null;
}): Suspect | null {
  const { spike, rxMbps, txMbps, prevRxMbps, top, prevTop, gpuPct, memPct } = input;
  if (!spike) return null;

  const load = (rxMbps ?? 0) + (txMbps ?? 0);
  const prevLoad = prevRxMbps ?? 0;
  const bandwidthJump = load >= 1.5 && load > prevLoad + 0.6;

  const prevCpu = new Map(prevTop.map((p) => [`${p.pid}:${p.name}`, p.cpu]));
  const ranked = [...top]
    .map((p) => {
      const deltaCpu = p.cpu - (prevCpu.get(`${p.pid}:${p.name}`) ?? p.cpu * 0.5);
      const kindBoost =
        p.kind === "download" ? 8 : p.kind === "sync" ? 6 : p.kind === "browser" ? 4 : p.kind === "overlay" ? 3 : 0;
      const score =
        p.cpu +
        Math.max(0, deltaCpu) * 1.4 +
        p.conns * 0.15 +
        kindBoost +
        (bandwidthJump && p.kind === "download" ? 12 : 0) +
        p.memPct * 0.05;
      return { p, score, deltaCpu };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (bandwidthJump) {
    const downloader = ranked.find((r) => r.p.kind === "download" || r.p.kind === "sync" || r.p.kind === "browser");
    const pick = downloader?.p ?? best?.p;
    if (pick) {
      return {
        label: pick.label,
        name: pick.name,
        kind: pick.kind,
        confidence: downloader ? "high" : "medium",
        reason: `Ligne saturée (~${load.toFixed(1)} Mb/s) — ${pick.label} est le plus probable.`,
      };
    }
    return {
      label: "Téléchargement",
      name: "network",
      kind: "download",
      confidence: "medium",
      reason: `La carte réseau grimpe à ~${load.toFixed(1)} Mb/s en même temps que le ping.`,
    };
  }

  if (best && (best.p.cpu >= 12 || best.deltaCpu >= 8)) {
    const why =
      best.p.kind === "overlay"
        ? "Overlay / encodeur CPU au moment du spike — souvent Discord, NVIDIA ou OBS."
        : best.p.kind === "browser"
          ? "Onglet ou stream dans le navigateur qui réveille le CPU / la bande passante."
          : "Ce process monte en CPU pile quand le ping saute.";
    return {
      label: best.p.label,
      name: best.p.name,
      kind: best.p.kind,
      confidence: best.p.cpu >= 25 ? "high" : "medium",
      reason: `${why} (${best.p.cpu.toFixed(0)} % CPU)`,
    };
  }

  if (gpuPct != null && gpuPct >= 70) {
    const encoder = ranked.find(
      (r) => r.p.kind === "overlay" || /obs|nvidia|discord|amd overlay/i.test(r.p.label),
    );
    if (encoder) {
      return {
        label: encoder.p.label,
        name: encoder.p.name,
        kind: encoder.p.kind,
        confidence: "medium",
        reason: `GPU à ${gpuPct.toFixed(0)} % avec ${encoder.p.label} — souvent de l’encode, pas forcément la cause du ping.`,
      };
    }
  }

  if (memPct != null && memPct >= 90) {
    const hog = [...top].sort((a, b) => b.memPct - a.memPct)[0];
    return {
      label: hog?.label ?? "RAM saturée",
      name: hog?.name ?? "memory",
      kind: hog?.kind ?? "other",
      confidence: "low",
      reason: `RAM à ${memPct.toFixed(0)} %${hog ? ` (${hog.label})` : ""} — plutôt hitch FPS que ping.`,
    };
  }

  return {
    label: "Pas un process évident",
    name: "unknown",
    kind: "other",
    confidence: "low",
    reason: "Spike sans hog CPU ni débit : Wi‑Fi, box, FAI, ou le serveur de jeu.",
  };
}
