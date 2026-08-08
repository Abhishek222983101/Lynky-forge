"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HotDealsList } from "@/components/dashboard/hot-deals-list";
import { OverdueTasksList } from "@/components/dashboard/overdue-tasks-list";
import { PipelineChart } from "@/components/dashboard/pipeline-chart";
import { StageDonut } from "@/components/dashboard/stage-donut";
import { StatCard } from "@/components/dashboard/stat-card";
import { WinGauge } from "@/components/dashboard/win-gauge";
import { useDashboard } from "@/hooks/use-dashboard";
import { formatINR } from "@/lib/format";

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-32" />
            <Skeleton className="mt-3 h-3 w-20" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-80 xl:col-span-2" />
        <Skeleton className="h-80" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useDashboard();

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="font-mono text-xs text-steel">{today}</p>
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !data ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-ink">Dashboard didn&apos;t load.</p>
          <p className="mt-1 text-sm text-steel">
            {error instanceof Error ? error.message : "Check that the API is running, then retry."}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal/90"
          >
            Retry
          </button>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              label="Pipeline Value"
              value={formatINR(data.pipelineValue)}
              sub={<span className="font-mono tnum">{data.activeDeals} open deals</span>}
            />
            <StatCard
              label="Active Deals"
              value={String(data.activeDeals)}
              sub={
                <span className="font-mono tnum">
                  {data.wonDeals} won · {data.lostDeals} lost · 90d
                </span>
              }
            />
            <StatCard
              label="Win Rate"
              value={data.winRate === null ? "—" : `${Math.round(data.winRate * 100)}%`}
              sub={<span>last 90 days</span>}
            />
            <StatCard
              label="Overdue Tasks"
              value={String(data.overdueTasks)}
              tone={data.overdueTasks > 0 ? "hazard" : "default"}
              sub={data.overdueTasks > 0 ? <span className="text-hazard">needs attention today</span> : <span>nothing slipping</span>}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <PipelineChart series={data.pipelineValueSeries} />
            </div>
            <StageDonut dealsByStage={data.dealsByStage} topLossReasons={data.topLossReasons} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <WinGauge winRate={data.winRate} wonDeals={data.wonDeals} lostDeals={data.lostDeals} />
            <HotDealsList deals={data.hotDeals} />
            <OverdueTasksList tasks={data.overdueTaskList} />
          </div>
        </div>
      )}
    </div>
  );
}
