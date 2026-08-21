import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function GuideTab() {
  return (
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
        title="Veille en fond"
        body="Un ping ICMP toutes les ~2 s, même derrière le jeu. Process / GPU seulement toutes les ~8 s, sauf spike. L’icône tray ouvre le dashboard, l’overlay, et quitte vraiment l’agent."
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
