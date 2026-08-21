import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import SysTray from "systray2";
import { AGENT_HOST, AGENT_PORT } from "./budget";
import { dataDir, ensureDataDirs } from "./paths";
import {
  getWatchStatus,
  onWatchFrame,
  setWatchRunning,
  startWatch,
} from "./watch";
import type { HudFrame } from "./suspects";

const TRAY_KEY = "__WHATLAGS_TRAY__";

function origin(): string {
  return `http://${AGENT_HOST}:${AGENT_PORT}`;
}

function openUrl(url: string): void {
  if (process.platform === "win32") {
    execFile("cmd", ["/c", "start", "", url], { windowsHide: true });
    return;
  }
  execFile(process.platform === "darwin" ? "open" : "xdg-open", [url]);
}

function writeTrayIcon(): string {
  ensureDataDirs();
  const file = path.join(dataDir(), "tray.ico");
  if (!fs.existsSync(file)) fs.writeFileSync(file, buildIco16());
  return file;
}

/** 16×16 32-bit ICO: teal disc on dark, no extra deps. */
function buildIco16(): Buffer {
  const size = 16;
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cy = size - 1 - y;
      const dx = x - 7.5;
      const dy = cy - 7.5;
      const i = (y * size + x) * 4;
      if (dx * dx + dy * dy <= 49) {
        xor[i] = 0xd4;
        xor[i + 1] = 0xea;
        xor[i + 2] = 0x5e;
        xor[i + 3] = 0xff;
      } else {
        xor[i] = 0x10;
        xor[i + 1] = 0x0a;
        xor[i + 2] = 0x07;
        xor[i + 3] = 0xff;
      }
    }
  }
  const andMask = Buffer.alloc(size * 4, 0);
  const dib = Buffer.alloc(40);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  const image = Buffer.concat([dib, xor, andMask]);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(image.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, image]);
}

function tooltipFor(frame: HudFrame | null): string {
  if (!frame) return "WhatLags — veille";
  const rtt = frame.rttMs == null ? "—" : `${Math.round(frame.rttMs)} ms`;
  if (frame.spike && frame.suspect) {
    return `WhatLags ${rtt} · ${frame.suspect.label}`;
  }
  return `WhatLags ${rtt}`;
}

function menuItems() {
  const status = getWatchStatus();
  return [
    { title: "Ouvrir le dashboard", tooltip: origin(), enabled: true },
    { title: "Overlay jeu", tooltip: "HUD ping", enabled: true },
    {
      title: "Veille",
      tooltip: status.running ? "Ping en fond" : "Veille en pause",
      checked: status.running,
      enabled: true,
    },
    { title: "Quitter", tooltip: "Arrêter WhatLags", enabled: true },
  ];
}

export async function startTray(): Promise<void> {
  const g = globalThis as typeof globalThis & { [TRAY_KEY]?: boolean };
  if (g[TRAY_KEY]) return;
  g[TRAY_KEY] = true;

  startWatch();

  const icon = writeTrayIcon();
  const systray = new SysTray({
    menu: {
      icon,
      title: "WhatLags",
      tooltip: tooltipFor(getWatchStatus().latest),
      items: menuItems(),
    },
    debug: false,
    copyDir: true,
  });

  const refreshMenu = () => {
    void systray.sendAction({
      type: "update-menu",
      menu: {
        icon,
        title: "WhatLags",
        tooltip: tooltipFor(getWatchStatus().latest),
        items: menuItems(),
      },
    });
  };

  onWatchFrame((frame) => {
    if (frame.spike) refreshMenu();
  });

  await systray.onClick((action) => {
    const title = action.item?.title ?? "";
    if (title === "Ouvrir le dashboard") {
      openUrl(origin());
      return;
    }
    if (title === "Overlay jeu") {
      const target = encodeURIComponent(getWatchStatus().target);
      openUrl(`${origin()}/overlay?target=${target}`);
      return;
    }
    if (title === "Veille") {
      setWatchRunning(!getWatchStatus().running);
      refreshMenu();
      return;
    }
    if (title === "Quitter") {
      onWatchFrame(null);
      void systray.kill(true);
    }
  });
}
