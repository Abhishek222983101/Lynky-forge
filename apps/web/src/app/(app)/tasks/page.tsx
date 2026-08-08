"use client";

import Link from "next/link";
import { Check, Clock, Phone, Send, Users, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTasks, useUpdateTaskStatus } from "@/hooks/use-tasks";
import { cn } from "@/lib/cn";
import { formatDate, relativeDate } from "@/lib/format";
import type { TaskStatus, TaskType } from "@/lib/types";

const TASK_TYPE_META: Record<TaskType, { label: string; icon: typeof Clock }> = {
  FOLLOW_UP: { label: "Follow-up", icon: Clock },
  CALL: { label: "Call", icon: Phone },
  SEND_QUOTE: { label: "Send Quote", icon: Send },
  RENEGOTIATE: { label: "Renegotiate", icon: MessageSquare },
  MEETING: { label: "Meeting", icon: Users },
};

function isOverdue(dueAt: string, status: TaskStatus): boolean {
  return status === "DUE" && new Date(dueAt).getTime() < Date.now();
}

export default function TasksPage() {
  const { data, isLoading, isError } = useTasks();
  const updateStatus = useUpdateTaskStatus();

  const tasks = data?.data ?? [];
  const overdue = tasks.filter((t) => isOverdue(t.dueAt, t.status));
  const due = tasks.filter((t) => t.status === "DUE" && !isOverdue(t.dueAt, t.status));
  const done = tasks.filter((t) => t.status === "DONE");

  function complete(id: string) {
    updateStatus.mutate({ id, status: "DONE" });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-32" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-10 text-center">
        <p className="font-medium text-ink">Tasks didn&apos;t load.</p>
        <p className="mt-1 text-sm text-steel">Make sure the API is running.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="font-mono text-xs text-steel tnum">
          {overdue.length} overdue · {due.length} due · {done.length} done
        </p>
      </div>

      {/* Overdue */}
      {overdue.length > 0 ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-hazard">
            <span className="size-1.5 rounded-full bg-hazard" />
            Overdue · needs attention
          </h2>
          <div className="space-y-2">
            {overdue.map((t) => {
              const meta = TASK_TYPE_META[t.type];
              const Icon = meta.icon;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border border-l-2 border-l-hazard border-mist bg-surface px-4 py-3"
                >
                  <Icon className="size-4 shrink-0 text-steel" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{t.message ?? "Untitled task"}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-steel">
                      {t.company ? (
                        <Link href={`/companies/${t.company.id}`} className="hover:text-ink">
                          {t.company.name}
                        </Link>
                      ) : null}
                      <span>·</span>
                      <span className={cn("font-mono tnum", isOverdue(t.dueAt, t.status) ? "text-hazard font-medium" : "")}>
                        {relativeDate(t.dueAt)}
                      </span>
                    </div>
                  </div>
                  <Badge tone="steel" mono>
                    {meta.label}
                  </Badge>
                  <button
                    onClick={() => complete(t.id)}
                    disabled={updateStatus.isPending}
                    className="flex size-7 items-center justify-center rounded-md border border-mist text-steel hover:border-signal hover:bg-signal-soft hover:text-signal disabled:opacity-50"
                    aria-label="Mark complete"
                  >
                    <Check className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Due */}
      {due.length > 0 ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">
            <span className="size-1.5 rounded-full bg-signal" />
            Due Soon
          </h2>
          <div className="space-y-2">
            {due.map((t) => {
              const meta = TASK_TYPE_META[t.type];
              const Icon = meta.icon;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border border-mist bg-surface px-4 py-3"
                >
                  <Icon className="size-4 shrink-0 text-steel" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{t.message ?? "Untitled task"}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-steel">
                      {t.company ? (
                        <Link href={`/companies/${t.company.id}`} className="hover:text-ink">
                          {t.company.name}
                        </Link>
                      ) : null}
                      <span>·</span>
                      <span className="font-mono tnum">{formatDate(t.dueAt)}</span>
                    </div>
                  </div>
                  <Badge tone="steel" mono>
                    {meta.label}
                  </Badge>
                  <button
                    onClick={() => complete(t.id)}
                    disabled={updateStatus.isPending}
                    className="flex size-7 items-center justify-center rounded-md border border-mist text-steel hover:border-signal hover:bg-signal-soft hover:text-signal disabled:opacity-50"
                    aria-label="Mark complete"
                  >
                    <Check className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Done */}
      {done.length > 0 ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">
            <span className="size-1.5 rounded-full bg-steel/40" />
            Completed
          </h2>
          <div className="space-y-2">
            {done.map((t) => {
              const meta = TASK_TYPE_META[t.type];
              const Icon = meta.icon;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border border-mist bg-canvas/50 px-4 py-3 opacity-60"
                >
                  <Icon className="size-4 shrink-0 text-steel" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-steel line-through">{t.message ?? "Untitled task"}</p>
                  </div>
                  <Check className="size-4 text-signal" />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {tasks.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-ink">No tasks.</p>
          <p className="mt-1 text-sm text-steel">Tasks appear here when deals move through the pipeline.</p>
        </Card>
      ) : null}
    </div>
  );
}
