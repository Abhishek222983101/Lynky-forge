"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { relativeDate } from "@/lib/format";
import type { TaskType } from "@/lib/types";

interface OverdueTask {
  id: string;
  type: TaskType;
  dueAt: string;
  message: string | null;
  deal: { id: string; title: string } | null;
}

const TYPE_LABEL: Record<TaskType, string> = {
  FOLLOW_UP: "Follow-up",
  CALL: "Call",
  SEND_QUOTE: "Send quote",
  RENEGOTIATE: "Renegotiate",
  MEETING: "Meeting",
};

export function OverdueTasksList({ tasks }: { tasks: OverdueTask[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Overdue Follow-ups</CardTitle>
        {tasks.length > 0 ? (
          <Badge tone="hazard" mono>
            {tasks.length}
          </Badge>
        ) : null}
      </CardHeader>
      <CardBody className="pt-2">
        {tasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-steel">All caught up. No overdue follow-ups.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="rounded-lg border-l-2 border-hazard bg-hazard-soft/50 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-medium text-ink">{t.message ?? TYPE_LABEL[t.type]}</p>
                  <span className="shrink-0 font-mono text-[11px] font-medium text-hazard tnum">
                    {relativeDate(t.dueAt)}
                  </span>
                </div>
                {t.deal ? <p className="mt-0.5 truncate text-xs text-steel">{t.deal.title}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
