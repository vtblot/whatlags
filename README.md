# WhatLags

Outil pour comprendre **pourquoi** le ping est élevé ou variable — pas seulement afficher un chiffre.

En jeu, « j’ai du ping » mélange plusieurs choses : le RTT de base, le **jitter** (le ping qui saute), les **pertes**, un **mauvais peering** vers un éditeur, un **DNS** lent, ou du **bufferbloat** (la box qui met trop de paquets en file dès que quelqu’un stream). WhatLags mesure tout ça et propose des causes, avec des pistes concrètes.

Site prévu : [whatlags.com](https://whatlags.com) (domaine encore libre au moment du check).

Des outils existent déjà (PingPlotter, WinMTR / `mtr`, test Waveform bufferbloat, overlays Steam/Discord). Celui-ci les réunit dans un tableau de bord et explique le résultat.

## Lancer en local (pour diagnostiquer *ta* ligne)

Les pings ICMP et le traceroute partent de **la machine qui exécute l’app**. Pour analyser ton Wi‑Fi / ta box / ton FAI, lance WhatLags sur le PC qui joue :

```bash
npm install
npm run build
npm start
```

Pour développer l’app : `npm run dev` (plus gourmand en RAM).

Ouvre [http://127.0.0.1:43147](http://127.0.0.1:43147).

Dépendances système (Linux) : `ping` et `traceroute`.

```bash
sudo apt install iputils-ping traceroute
```

Sur macOS, `ping` et `traceroute` sont déjà là.

## Charge PC (CPU / RAM / GPU)

WhatLags est prévu pour tourner **à côté d’un jeu**, pas pour le concurrencer :

- **Live** : 1 ping ICMP toutes les 2 s, graphe Recharts animé (désactivé si « réduire les animations »), pause dès que l’onglet n’est plus visible, arrêt auto au bout de 3 min
- **Diagnostic** : pings séquentiels (pas 3 processus d’un coup), traceroute court, bufferbloat ~6 Mo **jetés au fil de l’eau** (pas chargés en RAM), 3 sondes HTTP

Pour encore moins de RAM que `next dev` (le mode dev est volontairement lourd) :

```bash
npm run build
npm start
```

Ne lance pas le diagnostic complet **pendant** une ranked : le test bufferbloat sature volontairement un peu la ligne pendant ~6 s.

## Que fait le diagnostic

1. **Ping ICMP** (repli TCP :443 si ICMP est filtré) vers la cible + 1.1.1.1 / 8.8.8.8
2. **Traceroute** — où les millisecondes s’ajoutent
3. **DNS** — temps de résolution de quelques noms
4. **Bufferbloat** — ping au repos vs pendant un téléchargement
5. **Sondes HTTP** depuis le navigateur (RTT client, DNS+TLS inclus)

Le live affiche un oscillogramme. Un `*` sur un saut traceroute est souvent du filtrage ICMP, pas une panne.

## Overlay in-game

Le bouton **Overlay jeu** ouvre un mini HUD (fenêtre flottante Picture-in-Picture si le navigateur le permet, sinon popup).

À chaque spike de ping, WhatLags croise :

- le RTT
- le débit de la carte réseau
- le CPU / les sockets des process (Steam, Discord, Chrome, overlay NVIDIA, torrents…)

et affiche le **programme le plus probable**. Ce n’est pas une injection dans le jeu : l’anti-cheat ne voit rien. Le plein écran exclusif recouvre la fenêtre — passe en **fenêtré sans bordure** et épingle-la au premier plan (PowerToys Always On Top, raccourci souvent Win+Ctrl+T).

OBS : source navigateur → `http://127.0.0.1:43147/overlay`.

## Limites

- Ce n’est pas le ping UDP du serveur de jeu (tickrate, hitreg, interpolation).
- Un hostname d’éditeur (`riotgames.com`) n’est pas le datacenter LoL EUW.
- Si tu ouvres une démo hébergée ailleurs, ICMP mesure *ce* serveur, pas ta maison.

## Stack

Next.js, TypeScript, Tailwind, shadcn/ui.
