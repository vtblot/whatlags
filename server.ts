import { createServer } from "node:http";
import next from "next";
import { AGENT_HOST, AGENT_PORT } from "./src/lib/budget";
import { getLocalAgentToken } from "./src/lib/local-auth";
import { startWatch } from "./src/lib/watch";
import { startTray } from "./src/lib/tray";

const dev = process.argv.includes("--dev");

const hostname = AGENT_HOST;
const port = AGENT_PORT;

async function main() {
  getLocalAgentToken();
  startWatch();
  if (!dev && process.env.WHATLAGS_TRAY !== "0") {
    await startTray();
  }

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  createServer((req, res) => {
    void handle(req, res);
  }).listen(port, hostname, () => {
    console.log(`WhatLags → http://${hostname}:${port}`);
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
