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

/* ---------- Phase 4: Companies / RFQs / Quotes ---------- */

export type ActivityType =
  | "NOTE"
  | "STAGE_CHANGE"
  | "QUOTE_SENT"
  | "EMAIL"
  | "CALL"
  | "TASK_CREATED"
  | "DEAL_WON"
  | "DEAL_LOST";

export type RfqSource = "WEBSITE" | "EMAIL" | "PHONE" | "WHATSAPP" | "REFERRAL";

export interface Contact {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

/** GET /companies list item */
export interface CompanyListItem {
  id: string;
  name: string;
  industry: Industry;
  city: string | null;
  size: string | null;
  website: string | null;
  annualPotential: string | null;
  source: string | null;
  notes: string | null;
  createdAt: string;
  contacts: Contact[];
  _count: { deals: number };
}

/** Slim deal shape inside Company 360 (no nested company/contact/tasks) */
export interface CompanyDealItem {
  id: string;
  title: string;
  value: string;
  stage: DealStage;
  leadScore: LeadScore;
  lostReason: string | null;
  expectedClose: string | null;
  createdAt: string;
  updatedAt: string;
  quote: { id: string; quoteNo: string; status: QuoteStatus } | null;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  deal: { id: string; title: string } | null;
}

export interface CompanyTaskItem {
  id: string;
  type: TaskType;
  status: TaskStatus;
  dueAt: string;
  message: string | null;
  deal: { id: string; title: string } | null;
}

/** GET /companies/:id?include=deals,contacts,activities,tasks */
export interface CompanyDetail extends Omit<CompanyListItem, "contacts" | "_count"> {
  tags: string[] | null;
  contacts: Contact[];
  deals?: CompanyDealItem[];
  activities?: ActivityItem[];
  tasks?: CompanyTaskItem[];
}

/** GET /rfqs list item */
export interface RfqListItem {
  id: string;
  partName: string;
  partNo: string;
  material: string;
  qty: number;
  tolerance: string | null;
  targetPrice: string | null;
  deadline: string;
  source: RfqSource;
  createdAt: string;
  company: { id: string; name: string };
  deal: { id: string; title: string; stage: DealStage; value: string };
}

/** POST /rfqs payload — companyId XOR (companyName + companyIndustry) */
export interface CreateRfqPayload {
  partName: string;
  partNo: string;
  material: string;
  qty: number;
  tolerance?: string;
  targetPrice?: number;
  deadline: string;
  drawingNotes?: string;
  source: RfqSource;
  companyId?: string;
  companyName?: string;
  companyIndustry?: Industry;
  companyCity?: string;
}

export interface CreateRfqResult {
  company: { id: string; name: string };
  deal: { id: string; title: string; stage: DealStage; value: string };
  rfq: RfqListItem;
}

/** Line items use plain numbers — compute amount client-side (qty × unitPrice) */
export interface QuoteLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

/** GET /quotes list item */
export interface QuoteListItem {
  id: string;
  quoteNo: string;
  status: QuoteStatus;
  totalAmount: string;
  validUntil: string;
  aiGenerated: boolean;
  createdAt: string;
  deal: {
    id: string;
    title: string;
    stage: DealStage;
    company: { id: string; name: string };
  };
}

/** GET /quotes/:id — full detail with deal → company/contact/rfq */
export interface QuoteDetail {
  id: string;
  quoteNo: string;
  status: QuoteStatus;
  totalAmount: string;
  validUntil: string;
  aiGenerated: boolean;
  lineItems: QuoteLineItem[] | null;
  terms: string[] | null;
  createdAt: string;
  updatedAt: string;
  deal: {
    id: string;
    title: string;
    value: string;
    stage: DealStage;
    createdAt: string;
    company: { id: string; name: string; industry: Industry; city: string | null };
    contact: Contact | null;
    rfq: {
      id: string;
      partName: string;
      partNo: string;
      material: string;
      qty: number;
      tolerance: string | null;
      targetPrice: string | null;
      deadline: string;
      drawingNotes: string | null;
    } | null;
  };
}

export interface QuoteStatusResult {
  quote: QuoteListItem;
  tasksCreated: { id: string; message: string | null; dueAt: string }[];
}

/* ---------- Display metadata ---------- */

export const INDUSTRY_META: Record<Industry, string> = {
  AUTOMOTIVE: "Automotive",
  AEROSPACE: "Aerospace",
  ELECTRONICS: "Electronics",
  MEDICAL: "Medical",
  INDUSTRIAL: "Industrial",
};

export const LEAD_SCORE_TONE: Record<LeadScore, "signal" | "hazard" | "steel"> = {
  HOT: "hazard",
  WARM: "signal",
  COLD: "steel",
};

export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; tone: "signal" | "hazard" | "steel" | "info" | "neutral" }> = {
  DRAFT: { label: "Draft", tone: "steel" },
  SENT: { label: "Sent", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "signal" },
  REJECTED: { label: "Rejected", tone: "hazard" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

/** Valid next statuses per current status — mirrors backend state machine */
export const QUOTE_NEXT_STATUSES: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
};

export const RFQ_SOURCE_META: Record<RfqSource, string> = {
  WEBSITE: "Website",
  EMAIL: "Email",
  PHONE: "Phone",
  WHATSAPP: "WhatsApp",
  REFERRAL: "Referral",
};
