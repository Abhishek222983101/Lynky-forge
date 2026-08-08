/** Mirrors the NestJS API shapes exactly (apps/api/src/modules). */

export type DealStage = "NEW_RFQ" | "CONTACTED" | "QUOTE_SENT" | "NEGOTIATION" | "WON" | "LOST";
export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
export type LeadScore = "HOT" | "WARM" | "COLD";
export type TaskStatus = "DUE" | "DONE" | "SKIPPED";
export type TaskType = "FOLLOW_UP" | "CALL" | "SEND_QUOTE" | "RENEGOTIATE" | "MEETING";
export type Industry = "AUTOMOTIVE" | "AEROSPACE" | "ELECTRONICS" | "MEDICAL" | "INDUSTRIAL";

export interface DealListItem {
  id: string;
  title: string;
  value: string;
  stage: DealStage;
  leadScore: LeadScore;
  lostReason: string | null;
  expectedClose: string | null;
  createdAt: string;
  updatedAt: string;
  company: { id: string; name: string; industry: Industry };
  contact: { id: string; name: string } | null;
  quote: { id: string; quoteNo: string; status: QuoteStatus } | null;
  tasks: { id: string; dueAt: string; type: TaskType }[];
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface StageMoveResult {
  deal: DealListItem;
  order: { id: string; orderNo: string } | null;
  activity: { id: string };
  tasksCreated: { id: string; message: string | null; dueAt: string }[];
}

export interface DashboardData {
  pipelineValue: string;
  activeDeals: number;
  winRate: number | null;
  wonDeals: number;
  lostDeals: number;
  overdueTasks: number;
  dealsByStage: { stage: DealStage; count: number }[];
  pipelineValueSeries: { date: string; pipelineValue: string; dealsOpen: number }[];
  topLossReasons: { reason: string; count: number }[];
  hotDeals: { id: string; title: string; value: string; stage: DealStage; company: { name: string } }[];
  overdueTaskList: {
    id: string;
    type: TaskType;
    status: TaskStatus;
    dueAt: string;
    message: string | null;
    deal: { id: string; title: string } | null;
  }[];
}

export const STAGE_META: Record<DealStage, { label: string; color: string; soft: string }> = {
  NEW_RFQ: { label: "New RFQ", color: "var(--color-steel)", soft: "var(--color-mist)" },
  CONTACTED: { label: "Contacted", color: "var(--color-info)", soft: "var(--color-info-soft)" },
  QUOTE_SENT: { label: "Quote Sent", color: "var(--color-signal)", soft: "var(--color-signal-soft)" },
  NEGOTIATION: { label: "Negotiation", color: "var(--color-hazard)", soft: "var(--color-hazard-soft)" },
  WON: { label: "Won", color: "var(--color-signal)", soft: "var(--color-signal-soft)" },
  LOST: { label: "Lost", color: "var(--color-hazard)", soft: "var(--color-hazard-soft)" },
};

export const PIPELINE_STAGES: DealStage[] = ["NEW_RFQ", "CONTACTED", "QUOTE_SENT", "NEGOTIATION", "WON", "LOST"];
export const OPEN_STAGES: DealStage[] = ["NEW_RFQ", "CONTACTED", "QUOTE_SENT", "NEGOTIATION"];
