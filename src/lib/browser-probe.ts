export async function probeHttp(url: string): Promise<number | null> {
  const started = performance.now();
  try {
    await fetch(url, { cache: "no-store", mode: "no-cors", credentials: "omit" });
    return Math.round((performance.now() - started) * 10) / 10;
  } catch {
    return null;
  }
}

export type ConnectionHint = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
};

export function readConnectionHint(): ConnectionHint | null {
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
      type?: string;
    };
  };
  const c = nav.connection;
  if (!c) return null;
  return {
    effectiveType: c.effectiveType,
    downlink: c.downlink,
    rtt: c.rtt,
    saveData: c.saveData,
    type: c.type,
  };
}
