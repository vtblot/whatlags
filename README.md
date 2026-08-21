# WhatLags

Outil pour comprendre **pourquoi** le ping est élevé ou variable — et **quelle appli coincidait** avec un spike in-game.

En fond, WhatLags ping en ICMP, croise CPU / RAM / GPU / débit / process, et journalise chaque saut de latence. Le diagnostic (traceroute, DNS, bufferbloat) reste dispo, mais le mode principal c’est la veille pendant une partie.

Site prévu : [whatlags.com](https://whatlags.com).

## Lancer en local (PC de jeu)

Les pings ICMP partent de **la machine qui exécute l’app**. Sur Windows :

```bash
npm install
npm run build
npm start
```

Ça démarre l’agent : icône dans la barre des tâches, veille ping ~2 s, dashboard sur [http://127.0.0.1:43147](http://127.0.0.1:43147).

Menu tray : ouvrir le dashboard, overlay jeu, veille ON/OFF, quitter.

Pour développer l’UI : `npm run dev` (veille sans icône tray, pour éviter un doublon au HMR).

Le journal des spikes est dans `%LOCALAPPDATA%\WhatLags\logs\` (une ligne JSONL par spike).

Dépendances système (Linux) : `ping` et `traceroute`. Sur Windows, `ping` et `tracert` sont déjà là. Sur macOS, `ping` et `traceroute` aussi.

## Charge PC (CPU / RAM / GPU)

WhatLags est prévu pour tourner **à côté d’un jeu**, pas pour le concurrencer :

- **Veille** : 1 ping ICMP / 2 s + snapshot process, pas d’UI animée obligatoire
- **Live dashboard** : graphe Recharts, pause si l’onglet n’est plus visible, arrêt auto au bout de 3 min
- **Diagnostic** : pings séquentiels, traceroute court, bufferbloat ~6 Mo jetés au fil de l’eau

Ne lance pas le diagnostic complet **pendant** une ranked : le test bufferbloat sature volontairement un peu la ligne pendant ~6 s.

## Que fait la veille

À chaque tick, si le ping saute par rapport au baseline :

1. débit carte réseau (Steam, torrent, sync…)
2. CPU des process (Discord, overlay NVIDIA, antivirus…)
3. GPU haut + OBS / overlay → contexte encode (pas forcément la cause du ping)
4. RAM saturée → hitch FPS plus que ping
5. sinon : Wi‑Fi / box / FAI / serveur

## Overlay in-game

Le bouton **Overlay jeu** (ou le menu tray) ouvre un mini HUD. Ce n’est pas une injection dans le jeu : l’anti-cheat ne voit rien. Le plein écran exclusif recouvre la fenêtre — passe en **fenêtré sans bordure** et épingle-la au premier plan (PowerToys Always On Top).

OBS : source navigateur → `http://127.0.0.1:43147/overlay`.

## Limites

- Ce n’est pas le ping UDP du serveur de jeu (tickrate, hitreg, interpolation).
- Un hostname d’éditeur (`riotgames.com`) n’est pas le datacenter LoL EUW.
- GPU *par* process n’est pas mesuré (juste le GPU système).

## Stack

Next.js, TypeScript, Tailwind, shadcn/ui, systeminformation, systray2.
