"use client";

import { useCallback, useEffect, useState } from "react";
import { TARGET_SYNC_DEBOUNCE_MS } from "@/lib/budget";
import { isValidTarget } from "@/lib/host";
import { localPostInit } from "@/lib/local-fetch";
import type { GamePeer, SpikeSensitivity, WatchStatus } from "@/lib/suspects";

export function useWatch(activeHost: string, allowLan = false) {
  const [watch, setWatch] = useState<WatchStatus | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [peerHint, setPeerHint] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const tick = async () => {
      try {
        const res = await fetch("/api/watch", { cache: "no-store", signal: ac.signal });
        const data = (await res.json()) as WatchStatus;
        if (res.ok) setWatch(data);
      } catch {
        /* veille pas encore up */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/autostart", { cache: "no-store", signal: ac.signal })
      .then((res) => res.json())
      .then((data: { enabled?: boolean }) => setAutostart(!!data.enabled))
      .catch(() => undefined);
    return () => ac.abort();
  }, []);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch("/api/watch", await localPostInit({ ...body, allowLan }));
    const data = (await res.json()) as WatchStatus & { error?: string };
    if (!res.ok) throw new Error(data.error || "Veille impossible.");
    setWatch(data);
    return data;
  }, [allowLan]);

  useEffect(() => {
    if (!isValidTarget(activeHost, { allowLan })) return;
    const id = setTimeout(() => {
      void patch({ target: activeHost, allowLan }).catch(() => undefined);
    }, TARGET_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [activeHost, allowLan, patch]);

  const toggleWatch = useCallback(async () => {
    await patch({
      running: !(watch?.running ?? true),
      target: isValidTarget(activeHost, { allowLan }) ? activeHost : undefined,
      allowLan,
    });
  }, [activeHost, allowLan, patch, watch?.running]);

  const setSensitivity = useCallback(
    async (sensitivity: SpikeSensitivity) => {
      await patch({ sensitivity, allowLan });
    },
    [allowLan, patch],
  );

  const toggleAutostart = useCallback(async () => {
    const res = await fetch(
      "/api/autostart",
      await localPostInit({ enabled: !autostart }),
    );
    const data = (await res.json()) as { enabled?: boolean; error?: string };
    if (!res.ok) throw new Error(data.error || "Autostart impossible.");
    setAutostart(!!data.enabled);
  }, [autostart]);

  const detectPeer = useCallback(async (): Promise<GamePeer | null> => {
    setPeerHint(null);
    const res = await fetch("/api/peer", { cache: "no-store" });
    const data = (await res.json()) as { peer?: GamePeer | null; hint?: string; error?: string };
    if (!res.ok) throw new Error(data.error || "Peer introuvable.");
    if (!data.peer) {
      setPeerHint(data.hint ?? "Aucun peer UDP de jeu détecté.");
      return null;
    }
    setPeerHint(`${data.peer.process} → ${data.peer.ip}`);
    return data.peer;
  }, []);

  return {
    watch,
    autostart,
    peerHint,
    toggleWatch,
    setSensitivity,
    toggleAutostart,
    detectPeer,
  };
}
