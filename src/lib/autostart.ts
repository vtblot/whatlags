import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function appRoot(): string {
  return process.cwd();
}

export function startupDir(): string {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup",
    );
  }
  return path.join(os.homedir(), ".config", "autostart");
}

export function startupFile(): string {
  if (process.platform === "win32") {
    return path.join(startupDir(), "WhatLags.cmd");
  }
  return path.join(startupDir(), "whatlags.desktop");
}

export function isAutostartEnabled(): boolean {
  return fs.existsSync(startupFile());
}

function windowsCmd(root: string): string {
  const launcher = path.join(root, "scripts", "whatlags.cmd");
  return `@echo off\r\ncall "${launcher}"\r\n`;
}

function desktopEntry(root: string): string {
  const launcher = path.join(root, "scripts", "whatlags.sh");
  return `[Desktop Entry]
Type=Application
Name=WhatLags
Exec=${launcher}
X-GNOME-Autostart-enabled=true
`;
}

export function setAutostart(enabled: boolean, root = appRoot()): boolean {
  const file = startupFile();
  if (!enabled) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (process.platform === "win32") {
    fs.writeFileSync(file, windowsCmd(root), "utf8");
  } else {
    fs.writeFileSync(file, desktopEntry(root), "utf8");
    try {
      fs.chmodSync(file, 0o755);
    } catch {
      /* ignore */
    }
  }
  return true;
}
