"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PRESET_TARGETS } from "@/lib/targets";
import { CrosshairIcon } from "lucide-react";

export function TargetPicker({
  target,
  custom,
  onTarget,
  onCustom,
  onDetectPeer,
  detecting,
  peerHint,
}: {
  target: string;
  custom: string;
  onTarget: (host: string) => void;
  onCustom: (value: string) => void;
  onDetectPeer: () => void;
  detecting?: boolean;
  peerHint?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PRESET_TARGETS.map((p) => (
          <Tooltip key={p.id}>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant={target === p.host && !custom ? "default" : "outline"}
                  onClick={() => onTarget(p.host)}
                />
              }
            >
              {p.label}
            </TooltipTrigger>
            <TooltipContent>{p.hint}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={custom}
          onChange={(e) => onCustom(e.target.value)}
          placeholder="Hôte perso — IP de datacenter, 192.168.1.1…"
          className="font-mono"
        />
        <Button
          variant="outline"
          onClick={onDetectPeer}
          disabled={detecting}
          title="Peer UDP du process jeu détecté sur cette machine"
        >
          <CrosshairIcon />
          Serveur de jeu
        </Button>
      </div>
      {peerHint ? <p className="text-xs text-teal-200/80">{peerHint}</p> : null}
    </div>
  );
}
