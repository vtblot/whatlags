import { memo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { Finding, Severity } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  InfoIcon,
  OctagonXIcon,
} from "lucide-react";

const ICONS: Record<Severity, typeof InfoIcon> = {
  ok: CheckCircle2Icon,
  info: InfoIcon,
  warning: CircleAlertIcon,
  critical: OctagonXIcon,
};

const TONE: Record<Severity, string> = {
  ok: "border-teal-500/30 bg-teal-500/5",
  info: "border-sky-500/30 bg-sky-500/5",
  warning: "border-amber-500/35 bg-amber-500/5",
  critical: "border-rose-500/40 bg-rose-500/5",
};

const LABEL: Record<Severity, string> = {
  ok: "OK",
  info: "Info",
  warning: "Attention",
  critical: "Critique",
};

function FindingsListInner({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Lance un diagnostic pour des causes scorées. Les spikes in-game sont dans le journal.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {findings.map((f) => {
        const Icon = ICONS[f.severity];
        return (
          <Alert key={f.id} className={cn("items-start", TONE[f.severity])}>
            <Icon />
            <AlertTitle className="flex flex-wrap items-center gap-2">
              {f.title}
              <Badge variant="outline">{LABEL[f.severity]}</Badge>
              <span className="text-[11px] font-normal text-muted-foreground">
                confiance {f.confidence === "high" ? "haute" : f.confidence === "medium" ? "moyenne" : "basse"}
              </span>
            </AlertTitle>
            <AlertDescription>
              <p>{f.summary}</p>
              {f.evidence.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 font-mono text-[12px] text-zinc-400">
                  {f.evidence.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
              {f.actions.length > 0 ? (
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-zinc-300">
                  {f.actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ol>
              ) : null}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}

export const FindingsList = memo(FindingsListInner);
