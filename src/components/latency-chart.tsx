"use client";

import { memo, useSyncExternalStore } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_MAX_POINTS } from "@/lib/budget";

export type ChartPoint = {
  t: number;
  label: string;
  icmp: number | null;
  http: number | null;
};

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function reducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-white/10 bg-zinc-950/95 px-2.5 py-1.5 text-xs shadow-lg">
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 tabular-nums">
          <span className="size-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-zinc-400">{p.name}</span>
          <span className="text-zinc-50">
            {p.value == null ? "timeout" : `${p.value.toFixed(1)} ms`}
          </span>
        </div>
      ))}
    </div>
  );
}

function LatencyChartInner({ data }: { data: ChartPoint[] }) {
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    () => true,
  );
  const sliced = data.length > CHART_MAX_POINTS ? data.slice(-CHART_MAX_POINTS) : data;

  if (sliced.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        En attente d’échantillons…
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sliced} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="icmpFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5eead4" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#5eead4" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="httpFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            unit="ms"
            domain={[0, (max: number) => Math.max(80, Math.ceil(max / 20) * 20)]}
          />
          <ReferenceLine y={40} stroke="#5eead4" strokeOpacity={0.25} strokeDasharray="3 6" />
          <ReferenceLine y={80} stroke="#fbbf24" strokeOpacity={0.25} strokeDasharray="3 6" />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="icmp"
            name="ICMP / TCP"
            stroke="#5eead4"
            fill="url(#icmpFill)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={!reduceMotion}
            animationDuration={900}
            animationEasing="ease-out"
          />
          <Area
            type="monotone"
            dataKey="http"
            name="HTTP navigateur"
            stroke="#fbbf24"
            fill="url(#httpFill)"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={!reduceMotion}
            animationDuration={1100}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export const LatencyChart = memo(LatencyChartInner);
