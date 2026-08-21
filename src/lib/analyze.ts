import { round1 } from "./stats";
import type {
  BufferbloatResult,
  Diagnosis,
  DnsResult,
  Finding,
  Hop,
  PingSummary,
  TracerouteResult,
} from "./types";

function push(findings: Finding[], finding: Finding) {
  findings.push(finding);
}

function hopDeltas(hops: Hop[]): Array<{
  from: Hop;
  to: Hop;
  delta: number;
}> {
  const responding = hops.filter((h) => h.avgMs != null && h.host);
  const out: Array<{ from: Hop; to: Hop; delta: number }> = [];
  for (let i = 1; i < responding.length; i++) {
    const from = responding[i - 1];
    const to = responding[i];
    if (from.avgMs == null || to.avgMs == null) continue;
    out.push({ from, to, delta: round1(to.avgMs - from.avgMs) });
  }
  return out;
}

function isPrivateIp(ip: string | null): boolean {
  if (!ip) return false;
  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.startsWith("100.64.") ||
    ip.startsWith("100.65.")
  );
}

export function analyze(input: {
  pings: PingSummary[];
  traceroute?: TracerouteResult | null;
  dns?: DnsResult[];
  bufferbloat?: BufferbloatResult | null;
  gateway?: { gateway?: string; interface?: string } | null;
  origin?: "server" | "browser" | "local";
}): Diagnosis {
  const findings: Finding[] = [];
  const pings = input.pings.filter((p) => p.transmitted > 0);
  const reference =
    pings.find((p) => p.target === "1.1.1.1" || p.target === "8.8.8.8") ??
    pings[0];

  if (pings.length === 0) {
    return {
      score: 0,
      headline: "Aucune mesure exploitable.",
      findings: [
        {
          id: "no-data",
          title: "Pas de données",
          severity: "critical",
          confidence: "high",
          summary:
            "Le diagnostic n’a reçu aucun échantillon. ICMP est peut-être bloqué, ou la cible est injoignable.",
          evidence: [],
          actions: [
            "Relance le test",
            "Essaie 1.1.1.1, qui répond presque toujours au ping",
            "Vérifie que ping/traceroute sont installés sur la machine",
          ],
        },
      ],
    };
  }

  const avgs = pings
    .map((p) => p.avgMs)
    .filter((v): v is number => v != null);
  const jitters = pings
    .map((p) => p.jitterMs)
    .filter((v): v is number => v != null);
  const losses = pings.map((p) => p.lossPct);
  const worstLoss = Math.max(...losses, 0);
  const typicalAvg = median(avgs) ?? reference?.avgMs ?? null;
  const typicalJitter = median(jitters) ?? 0;
  const spread =
    avgs.length >= 2 ? Math.max(...avgs) - Math.min(...avgs) : 0;

  if (typicalAvg != null && typicalAvg < 35 && typicalJitter < 8 && worstLoss < 1) {
    push(findings, {
      id: "healthy",
      title: "Chemin réseau propre",
      severity: "ok",
      confidence: "high",
      summary:
        "Latence basse, jitter calme, quasi aucune perte. Si un jeu lag quand même, ce n’est probablement pas la ligne : serveur de jeu, tickrate, rendu, ou overlay.",
      evidence: [
        `RTT médian ${round1(typicalAvg)} ms`,
        `Jitter médian ${round1(typicalJitter)} ms`,
        `Perte max ${round1(worstLoss)} %`,
      ],
      actions: [
        "Mesure vers le datacenter du jeu (pas seulement 1.1.1.1)",
        "Ferme les overlays (Discord, GeForce, RGB) pour tester le client",
        "Compare Ethernet vs Wi‑Fi sur le même test",
      ],
    });
  }

  if (typicalAvg != null && typicalAvg >= 80) {
    push(findings, {
      id: "high-baseline",
      title: "Ping de base élevé",
      severity: typicalAvg >= 120 ? "critical" : "warning",
      confidence: "high",
      summary:
        typicalAvg >= 150
          ? "Un RTT aussi haut vers un anycast proche ressemble à du 4G/5G chargé, un VPN, du satellite, ou un routage très détourné — pas à de la fibre locale."
          : "Le plancher de latence est déjà haut. En jeu, tu partiras de cette valeur même quand “rien ne se passe”.",
      evidence: [`RTT médian ${round1(typicalAvg)} ms sur ${pings.length} cible(s)`],
      actions: [
        "Coupe le VPN / proxy / Zero-Trust le temps d’un test",
        "Passe en Ethernet, désactive le Wi‑Fi pour isoler",
        "Vérifie que tu n’es pas en partage de connexion mobile",
        "Regarde le traceroute : si le 1er saut utile est déjà à 40 ms+, le problème est près de toi",
      ],
    });
  } else if (typicalAvg != null && typicalAvg >= 50) {
    push(findings, {
      id: "medium-baseline",
      title: "Ping correct, pas compétitif",
      severity: "info",
      confidence: "medium",
      summary:
        "Jouable, mais les jeux rapides (FPS, fight) sentent déjà ce palier. Souvent distance géographique ou peering moyen, pas forcément un “bug”.",
      evidence: [`RTT médian ${round1(typicalAvg)} ms`],
      actions: [
        "Choisis un serveur de jeu plus proche (région EU si tu es en France)",
        "Compare 1.1.1.1 et le hostname du jeu : si seul le jeu est haut, c’est le peering",
      ],
    });
  }

  if (typicalJitter >= 15) {
    push(findings, {
      id: "high-jitter",
      title: "Ping variable (jitter)",
      severity: typicalJitter >= 30 ? "critical" : "warning",
      confidence: "high",
      summary:
        "Le jitter, c’est ce que les gens appellent “le ping qui saute”. Le min peut être bon et le jeu rester ingérable : hitreg, rubber-band, voix en robot.",
      evidence: [
        `Jitter médian ${round1(typicalJitter)} ms`,
        reference?.maxMs != null && reference.minMs != null
          ? `Écart min→max ${reference.minMs} → ${reference.maxMs} ms`
          : "Échantillons irréguliers",
      ],
      actions: [
        "Wi‑Fi : rapproche-toi de la box, bande 5 GHz, canal moins saturé, coupe le 2,4 GHz si tu peux",
        "Évite CPL et répéteurs pour du jeu compétitif",
        "Coupe les gros téléchargements / streams / cloud backups pendant le test bufferbloat",
        "Sur PC : mode performance, pas de limite CPU trop agressive, fermer les scans antivirus lourds",
      ],
    });
  } else if (typicalJitter >= 8) {
    push(findings, {
      id: "mild-jitter",
      title: "Un peu de variation",
      severity: "info",
      confidence: "medium",
      summary:
        "Ce n’est pas dramatique, mais ça se sent en duel. Souvent du Wi‑Fi un peu chargé ou un buffer trop gros sur la box.",
      evidence: [`Jitter ${round1(typicalJitter)} ms`],
      actions: [
        "Active le SQM / QoS “cake” ou “fq_codel” sur la box si elle le propose",
        "Teste 10 minutes Ethernet vs Wi‑Fi",
      ],
    });
  }

  if (worstLoss >= 2) {
    const lossy = pings.filter((p) => p.lossPct >= 2);
    push(findings, {
      id: "packet-loss",
      title: "Pertes de paquets",
      severity: worstLoss >= 5 ? "critical" : "warning",
      confidence: "high",
      summary:
        "1 % de perte se voit déjà en jeu. Au-delà, le client interpolera : tu “téléportes”, les balles ne enregistrent pas.",
      evidence: lossy.map(
        (p) => `${p.target} : ${p.lossPct} % de perte (${p.received}/${p.transmitted})`,
      ),
      actions: [
        "Câble Ethernet à la place du Wi‑Fi — c’est le test n°1",
        "Change de câble / port box si Ethernet perd aussi",
        "Redémarre box + ondes : micro-ondes, Bluetooth saturé, voisinage 2,4 GHz",
        "Si la perte n’apparaît que vers une cible, c’est le chemin (FAI/peering), pas ta machine",
      ],
    });
  }

  if (spread >= 40 && avgs.length >= 2) {
    const sorted = [...pings].sort(
      (a, b) => (b.avgMs ?? 0) - (a.avgMs ?? 0),
    );
    const slow = sorted[0];
    const fast = [...pings].sort((a, b) => (a.avgMs ?? 9e9) - (b.avgMs ?? 9e9))[0];
    push(findings, {
      id: "asymmetric",
      title: "Une cible est beaucoup plus lente",
      severity: "warning",
      confidence: "medium",
      summary:
        "Si 1.1.1.1 est bon et “le jeu” est mauvais, ce n’est pas “ton ping” en général : c’est le routage vers cet éditeur (peering FAI).",
      evidence: [
        `Écart ${round1(spread)} ms entre cibles`,
        slow?.avgMs != null
          ? `Plus lent : ${slow.target} (${slow.avgMs} ms)`
          : "Cible lente",
        fast?.avgMs != null
          ? `Plus rapide : ${fast.target} (${fast.avgMs} ms)`
          : "Cible rapide",
      ],
      actions: [
        "Note le serveur / la région dans le jeu et reteste ce hostname",
        "Compare avec un autre FAI (partage 4G) : si ça disparaît, ticket au FAI avec traceroute",
        "VPN parfois améliore un mauvais peering — à tester, pas à laisser allumé par défaut",
      ],
    });
  }

  const hops = input.traceroute?.hops ?? [];
  if (hops.length > 0) {
    const firstUseful = hops.find((h) => h.avgMs != null && h.host);
    const timeouts = hops.filter((h) => h.host == null).length;
    const deltas = hopDeltas(hops);
    const destHop = [...hops].reverse().find((h) => h.avgMs != null);
    const destRtt = destHop?.avgMs ?? null;
    const realJumps = deltas.filter(
      (d) => destRtt == null || (d.to.avgMs ?? 0) <= destRtt + 12,
    );
    const worstJump = [...realJumps].sort((a, b) => b.delta - a.delta)[0];

    const icmpInflated = hops.filter(
      (h) =>
        destHop?.avgMs != null &&
        h.avgMs != null &&
        h.avgMs > destHop.avgMs + 20,
    );

    if (icmpInflated.length > 0 && destHop?.avgMs != null) {
      push(findings, {
        id: "icmp-deprioritized",
        title: "Sauts traceroute plus lents que la cible — pas un vrai goulot",
        severity: "info",
        confidence: "high",
        summary:
          "Un routeur peut répondre à ICMP avec 80 ms de retard alors que tes paquets de jeu passent en 3 ms. Si un saut du milieu est plus haut que la destination, ignore-le : le ping réel est celui de la cible.",
        evidence: icmpInflated.map(
          (h) =>
            `Saut ${h.hop} (${h.host ?? "*"}) ${h.avgMs} ms > destination ${destHop.avgMs} ms`,
        ),
        actions: [
          "Fie-toi au RTT de la cible, pas au pic d’un saut intermédiaire",
          "Un * suivi d’un saut normal est banal (filtrage ICMP)",
        ],
      });
    }

    if (firstUseful && firstUseful.avgMs != null && firstUseful.avgMs >= 12) {
      const localish = isPrivateIp(firstUseful.host);
      push(findings, {
        id: "local-hop",
        title: localish
          ? "Le 1er saut (box / LAN) est déjà lent"
          : "Le premier saut qui répond est lent",
        severity: firstUseful.avgMs >= 25 ? "warning" : "info",
        confidence: localish ? "high" : "medium",
        summary: localish
          ? "Si la box met 15–80 ms à répondre, le Wi‑Fi, le CPL ou un routeur saturé mangent le ping avant même Internet."
          : "Les sauts silencieux (*) ne sont pas forcément de la perte : beaucoup de routeurs filtrent ICMP. Le premier RTT utile reste un indice.",
        evidence: [
          `Saut ${firstUseful.hop} (${firstUseful.host}) : ${firstUseful.avgMs} ms`,
          input.gateway?.gateway
            ? `Passerelle locale : ${input.gateway.gateway} (${input.gateway.interface ?? "?"})`
            : "Passerelle non détectée",
        ],
        actions: [
          "Teste un ping vers l’IP de ta box (souvent 192.168.1.1 ou 192.168.0.1)",
          "Ethernet direct, Wi‑Fi off, QoS box, canal 5 GHz",
          "Évite un 2e routeur en cascade (“double NAT”) pour du jeu",
        ],
      });
    }

    if (worstJump && worstJump.delta >= 25) {
      const toPrivate = isPrivateIp(worstJump.to.host);
      push(findings, {
        id: "latency-jump",
        title:
          worstJump.to.hop <= 4
            ? "Saut de latence chez le FAI / last mile"
            : "Saut de latence plus loin sur le chemin",
        severity: worstJump.delta >= 60 ? "warning" : "info",
        confidence: "medium",
        summary: toPrivate
          ? "Le saut reste dans du privé / CGNAT : congestion box, 4G box, ou opérateur."
          : "Le traceroute montre où les millisecondes s’ajoutent. Un gros palier au milieu = file d’attente ou mauvais peering, pas ton PC.",
        evidence: [
          `+${worstJump.delta} ms entre le saut ${worstJump.from.hop} (${worstJump.from.host}) et ${worstJump.to.hop} (${worstJump.to.host})`,
          timeouts > 0
            ? `${timeouts} saut(s) sans réponse ICMP — souvent du filtrage, pas une panne`
            : "Tous les sauts ont répondu",
        ],
        actions: [
          "Refais 2 traceroutes à 10 min d’intervalle : un saut instable se voit",
          "Joins ce traceroute à un ticket FAI si le palier est chez eux (sauts 2–5)",
          "Un * au milieu suivi d’un saut normal est banal, ne panique pas",
        ],
      });
    }
  } else if (input.traceroute?.error) {
    push(findings, {
      id: "trace-failed",
      title: "Traceroute indisponible",
      severity: "info",
      confidence: "high",
      summary:
        "Sans la carte des sauts, on voit le symptôme (ping haut) mais pas l’étage responsable.",
      evidence: [input.traceroute.error],
      actions: ["Installe traceroute (paquet traceroute) et relance"],
    });
  }

  const dns = input.dns ?? [];
  if (dns.length > 0) {
    const slow = dns.filter((d) => d.durationMs >= 80 || d.error);
    const avgDns =
      dns.reduce((a, d) => a + d.durationMs, 0) / Math.max(dns.length, 1);
    if (slow.length > 0 || avgDns >= 50) {
      push(findings, {
        id: "slow-dns",
        title: "Résolution DNS lente",
        severity: avgDns >= 120 ? "warning" : "info",
        confidence: "medium",
        summary:
          "Le DNS ne change pas le ping en partie, mais il ajoute du “ça freeze au load / au teleport”. Un résolveur loin ou une box saturée se sent au menu, pas au recoil.",
        evidence: dns.map((d) =>
          d.error
            ? `${d.name} : échec (${d.durationMs} ms)`
            : `${d.name} : ${d.durationMs} ms → ${d.addresses[0] ?? "?"}`,
        ),
        actions: [
          "Teste 1.1.1.1 ou 9.9.9.9 comme DNS (box ou OS)",
          "Évite le DNS “parental” lointain si tu joues",
        ],
      });
    } else {
      push(findings, {
        id: "dns-ok",
        title: "DNS réactif",
        severity: "ok",
        confidence: "high",
        summary: "La résolution d’adresse n’explique pas un ping de partie élevé.",
        evidence: [`Moyenne ${round1(avgDns)} ms sur ${dns.length} noms`],
        actions: [],
      });
    }
  }

  const bb = input.bufferbloat;
  if (bb && bb.deltaMs != null) {
    if (bb.grade === "A" || bb.grade === "B") {
      push(findings, {
        id: "bloat-ok",
        title: `Bufferbloat ${bb.grade} — la ligne tient sous charge`,
        severity: "ok",
        confidence: "high",
        summary:
          "Quand quelqu’un télécharge, ton ping ne s’effondre pas. C’est le contraire du classique “dès que Netflix tourne, je lag”.",
        evidence: [
          `Idle ${bb.idleAvgMs ?? "—"} ms → chargé ${bb.loadedAvgMs ?? "—"} ms (Δ ${bb.deltaMs} ms)`,
        ],
        actions: [],
      });
    } else {
      push(findings, {
        id: "bloat-bad",
        title: `Bufferbloat ${bb.grade} — ping qui explose sous charge`,
        severity: bb.grade === "F" || bb.grade === "D" ? "critical" : "warning",
        confidence: "high",
        summary:
          "La box (ou le FAI) met trop de paquets en file. Le débit a l’air “bon”, le ping devient ridicule dès qu’il y a du trafic. Très fréquent en France sur les box par défaut.",
        evidence: [
          `Idle ${bb.idleAvgMs ?? "—"} ms → chargé ${bb.loadedAvgMs ?? "—"} ms`,
          `+${bb.deltaMs} ms dès qu’un téléchargement tourne`,
        ],
        actions: [
          "Active SQM / QoS / “Smart Queue” sur la box, ou un routeur avec cake/fq_codel",
          "Limite le débit un cran sous le max (ex. 90 % de ta synchro)",
          "Pause cloud (OneDrive, Steam download) pendant les ranked",
          "Sépare le Wi‑Fi “invités / TV” si tu peux",
        ],
      });
    }
  }

  if (input.origin === "server") {
    push(findings, {
      id: "origin-server",
      title: "Mesures prises depuis la machine qui héberge l’app",
      severity: "info",
      confidence: "high",
      summary:
        "ICMP et traceroute partent d’ici, pas magiquement de ton PC de jeu. Pour diagnostiquer ton Wi‑Fi, lance WhatLags en local. Les sondes “navigateur” collent mieux à ton client actuel.",
      evidence: [],
      actions: ["git clone / npm run dev sur le PC qui joue, puis relance le diagnostic"],
    });
  }

  const penalty = findings.reduce((acc, f) => {
    if (f.severity === "critical") return acc + 28;
    if (f.severity === "warning") return acc + 14;
    if (f.severity === "info") return acc + 4;
    return acc;
  }, 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const worst = findings.find((f) => f.severity === "critical")
    ?? findings.find((f) => f.severity === "warning");

  const headline = worst
    ? worst.title
    : score >= 85
      ? "Rien d’évident côté réseau — cherche serveur, client ou Wi‑Fi intermittent."
      : "Quelques points à surveiller, rien de bloquant.";

  const order = { critical: 0, warning: 1, info: 2, ok: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score, headline, findings };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
