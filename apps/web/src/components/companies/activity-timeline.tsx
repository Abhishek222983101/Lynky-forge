"use client";

import {
  ArrowRightLeft,
  FileText,
  ListChecks,
  Mail,
  Phone,
  Send,
  Trophy,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { relativeDate } from "@/lib/format";
import type { ActivityItem, ActivityType } from "@/lib/types";

const TYPE_ICON: Record<ActivityType, LucideIcon> = {
  NOTE: FileText,
  STAGE_CHANGE: ArrowRightLeft,
  QUOTE_SENT: Send,
  EMAIL: Mail,
  CALL: Phone,
  TASK_CREATED: ListChecks,
  DEAL_WON: Trophy,
  DEAL_LOST: XCircle,
};

const TYPE_COLOR: Record<ActivityType, string> = {
  NOTE: "text-steel",
  STAGE_CHANGE: "text-info",
  QUOTE_SENT: "text-info",
  EMAIL: "text-steel",
  CALL: "text-steel",
  TASK_CREATED: "text-steel",
  DEAL_WON: "text-signal",
  DEAL_LOST: "text-hazard",
};

export function ActivityTimeline({ activities }: { activities: ActivityItem[] }) {
  if (activities.length === 0) {
    return <p className="py-8 text-center text-sm text-steel">No activity yet. Notes, calls and stage moves land here.</p>;
  }
  return (
    <ol className="relative space-y-0">
      {activities.map((a, i) => {
        const Icon = TYPE_ICON[a.type] ?? FileText;
        const last = i === activities.length - 1;
        return (
          <li key={a.id} className="relative flex gap-3 pb-5">
            {!last ? <span className="absolute left-[13px] top-7 h-full w-px bg-mist" aria-hidden /> : null}
            <span className={cn("z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-mist bg-surface", TYPE_COLOR[a.type])}>
              <Icon className="size-3.5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-[13px] leading-5 text-ink">{a.description}</p>
              <p className="mt-0.5 font-mono text-[11px] text-steel tnum">
                {relativeDate(a.createdAt)}
                {a.deal ? <span className="text-steel"> · {a.deal.title}</span> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
