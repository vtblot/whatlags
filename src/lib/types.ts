export type Severity = "ok" | "info" | "warning" | "critical";

export type ProbeMethod = "icmp" | "tcp" | "http";

export type PingSample = {
  seq: number;
  rttMs: number | null;
  ttl?: number;
  at: number;
};

export type PingSummary = {
  target: string;
  resolvedIp?: string;
  method: ProbeMethod;
  transmitted: number;
  received: number;
  lossPct: number;
  minMs: number | null;
  avgMs: number | null;
  maxMs: number | null;
  jitterMs: number | null;
  stddevMs: number | null;
  samples: PingSample[];
  error?: string;
};

export type Hop = {
  hop: number;
  host: string | null;
  rttsMs: Array<number | null>;
  avgMs: number | null;
};

export type TracerouteResult = {
  target: string;
  hops: Hop[];
  error?: string;
};

export type DnsResult = {
  name: string;
  addresses: string[];
  durationMs: number;
  error?: string;
};

export type BufferbloatGrade = "A" | "B" | "C" | "D" | "F" | "?";

export type BufferbloatResult = {
  target: string;
  idleAvgMs: number | null;
  loadedAvgMs: number | null;
  deltaMs: number | null;
  grade: BufferbloatGrade;
  idle: PingSummary;
  loaded: PingSummary;
  error?: string;
};

export type Finding = {
  id: string;
  title: string;
  severity: Severity;
  confidence: "low" | "medium" | "high";
  summary: string;
  evidence: string[];
  actions: string[];
};

export type Diagnosis = {
  score: number;
  headline: string;
  findings: Finding[];
};

export type GatewayInfo = {
  gateway?: string;
  interface?: string;
  error?: string;
};
