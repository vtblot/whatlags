export type PresetTarget = {
  id: string;
  label: string;
  host: string;
  hint: string;
  kind: "anycast" | "dns" | "game" | "infra" | "custom";
};

export const PRESET_TARGETS: PresetTarget[] = [
  {
    id: "cf",
    label: "Cloudflare",
    host: "1.1.1.1",
    hint: "Anycast mondial, référence ping propre",
    kind: "dns",
  },
  {
    id: "google-dns",
    label: "Google DNS",
    host: "8.8.8.8",
    hint: "Autre anycast très pairé",
    kind: "dns",
  },
  {
    id: "quad9",
    label: "Quad9",
    host: "9.9.9.9",
    hint: "DNS anycast, souvent en Europe",
    kind: "dns",
  },
  {
    id: "cloudflare-edge",
    label: "Cloudflare (HTTPS)",
    host: "www.cloudflare.com",
    hint: "Edge CDN, proche d’un joueur en France",
    kind: "infra",
  },
  {
    id: "valve",
    label: "Steam / Valve",
    host: "steam.com",
    hint: "Infra jeu, pas un serveur CS précis",
    kind: "game",
  },
  {
    id: "riot",
    label: "Riot (EUW-ish)",
    host: "riotgames.com",
    hint: "Front web Riot, pas le serveur LoL",
    kind: "game",
  },
  {
    id: "epic",
    label: "Epic Games",
    host: "epicgames.com",
    hint: "Fortnite / Epic backend",
    kind: "game",
  },
  {
    id: "discord",
    label: "Discord",
    host: "discord.com",
    hint: "Voix + overlay, souvent cité avec le ping",
    kind: "infra",
  },
];

export const BROWSER_HTTP_TARGETS = [
  {
    id: "cf-trace",
    label: "Cloudflare",
    url: "https://www.cloudflare.com/cdn-cgi/trace",
  },
  {
    id: "google-204",
    label: "Google",
    url: "https://www.gstatic.com/generate_204",
  },
  {
    id: "cloudflare-ok",
    label: "1.1.1.1",
    url: "https://1.1.1.1/cdn-cgi/trace",
  },
] as const;

export const DNS_NAMES = [
  "www.google.com",
  "steamcommunity.com",
  "discord.com",
  "cloudflare.com",
];
