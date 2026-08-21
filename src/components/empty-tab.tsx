"use client";

import { Button } from "@/components/ui/button";
import { RouteIcon } from "lucide-react";

export function EmptyTab({
  children,
  onDiagnose,
}: {
  children: string;
  onDiagnose?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-muted-foreground">{children}</p>
      {onDiagnose ? (
        <Button size="sm" onClick={onDiagnose}>
          <RouteIcon />
          Lancer un diagnostic
        </Button>
      ) : null}
    </div>
  );
}
