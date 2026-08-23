export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getLocalAgentToken } = await import("./lib/local-auth");
  const { startWatch } = await import("./lib/watch");
  getLocalAgentToken();
  startWatch();
}
