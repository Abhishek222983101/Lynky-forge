/**
 * Seed demo data for Lynky Forge.
 *
 * Wipes all transactional data (companies, deals, rfqs, quotes, tasks,
 * activities, orders, snapshots, caches) then creates a realistic Indian
 * contract-manufacturing CRM state:
 *   - 14 companies across 5 industries
 *   - 30 deals distributed across pipeline stages
 *   - RFQs, quotes, orders, tasks, activities — all interlinked
 *   - 60-day dashboard snapshot series for the pipeline chart
 *
 * Idempotent: safe to run repeatedly. Does NOT touch users or shops.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ActivityType,
  DealSource,
  DealStage,
  Industry,
  LeadScore,
  OrderStatus,
  PrismaClient,
  QuoteStatus,
  RfqSource,
  TaskStatus,
  TaskType,
  UserRole,
} from "@prisma/client";

function loadEnvFile() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      process.env[key] ??= value;
    }
  }
}

// ─── Realistic Indian manufacturing companies ──────────────────────────

interface SeedCompany {
  name: string;
  industry: Industry;
  city: string;
  size: string;
  website: string;
  annualPotential: number;
  source: DealSource;
  notes: string;
  contact: { name: string; role: string; phone: string; email: string; isPrimary: boolean };
}

const COMPANIES: SeedCompany[] = [
  {
    name: "Ashoka Engineering Works",
    industry: Industry.AUTOMOTIVE,
    city: "Pune",
    size: "201-500",
    website: "ashokaeng.in",
    annualPotential: 8500000,
    source: DealSource.REFERRAL,
    notes: "Tier-2 supplier to Tata Motors and Mahindra. Strong in CNC turning and precision shafts.",
    contact: { name: "Rajesh Kulkarni", role: "Purchase Manager", phone: "+91 98220 14523", email: "rajesh@ashokaeng.in", isPrimary: true },
  },
  {
    name: "Bharat CNC Components",
    industry: Industry.AUTOMOTIVE,
    city: "Chennai",
    size: "101-200",
    website: "bharatcnc.com",
    annualPotential: 6200000,
    source: DealSource.TRADE_SHOW,
    notes: "Specialises in transmission housings and gear blanks. ISO 9001 certified.",
    contact: { name: "Suresh Iyer", role: "VP Procurement", phone: "+91 98410 33781", email: "suresh@bharatcnc.com", isPrimary: true },
  },
  {
    name: "Coromandel Precision Castings",
    industry: Industry.AEROSPACE,
    city: "Hyderabad",
    size: "51-200",
    website: "coromandelcast.com",
    annualPotential: 12000000,
    source: DealSource.REFERRAL,
    notes: "Investment casting for aerospace. Works with HAL and ISRO subcontractors. AS9100 certified.",
    contact: { name: "Dr. Lakshmi Rao", role: "Technical Director", phone: "+91 90000 11223", email: "lakshmi@coromandelcast.com", isPrimary: true },
  },
  {
    name: "Dharani Fabricators",
    industry: Industry.INDUSTRIAL,
    city: "Coimbatore",
    size: "201-500",
    website: "dharanifab.in",
    annualPotential: 4500000,
    source: DealSource.WEBSITE,
    notes: "Heavy fabrication — structural steel, conveyor frames, hoppers. Good for bulk quantity orders.",
    contact: { name: "Murugan S", role: "Director", phone: "+91 98430 56712", email: "murugan@dharanifab.in", isPrimary: true },
  },
  {
    name: "Eagle Forgings Pvt Ltd",
    industry: Industry.AEROSPACE,
    city: "Bengaluru",
    size: "101-200",
    website: "eagleforge.in",
    annualPotential: 9800000,
    source: DealSource.COLD_OUTREACH,
    notes: "Closed-die forging for aerospace and defence. Working towards NADCAP accreditation.",
    contact: { name: "Wing Cdr (Retd) Vikram Nair", role: "CEO", phone: "+91 98450 77881", email: "vikram@eagleforge.in", isPrimary: true },
  },
  {
    name: "Frontier Sheet Metal",
    industry: Industry.ELECTRONICS,
    city: "Noida",
    size: "51-200",
    website: "frontiersm.com",
    annualPotential: 3200000,
    source: DealSource.RFQ_PORTAL,
    notes: "Sheet metal enclosures for electronics and telecom. Laser cutting + press brake capabilities.",
    contact: { name: "Anil Gupta", role: "Operations Head", phone: "+91 98100 33442", email: "anil@frontiersm.com", isPrimary: true },
  },
  {
    name: "Himalaya Medical Devices",
    industry: Industry.MEDICAL,
    city: "Ahmedabad",
    size: "11-50",
    website: "himalayamed.in",
    annualPotential: 5500000,
    source: DealSource.REFERRAL,
    notes: "Surgical instrument and implant components. ISO 13485 certified. High-margin, low-volume.",
    contact: { name: "Dr. Priya Desai", role: "Founder & MD", phone: "+91 90990 22118", email: "priya@himalayamed.in", isPrimary: true },
  },
  {
    name: "Indus Tooling Systems",
    industry: Industry.AUTOMOTIVE,
    city: "Gurgaon",
    size: "201-500",
    website: "industooling.in",
    annualPotential: 11000000,
    source: DealSource.TRADE_SHOW,
    notes: "Injection mould tools and dies. Strong design team. Regular customer for complex tooling.",
    contact: { name: "Harpreet Singh", role: "Purchase Head", phone: "+91 98180 44551", email: "harpreet@industooling.in", isPrimary: true },
  },
  {
    name: "Jaipur Metals & Alloys",
    industry: Industry.INDUSTRIAL,
    city: "Jaipur",
    size: "51-200",
    website: "jpmetals.in",
    annualPotential: 3800000,
    source: DealSource.WEBSITE,
    notes: "Non-ferrous casting and machining. Brass and aluminium components for valves and fittings.",
    contact: { name: "Mahesh Sharma", role: "Partner", phone: "+91 94140 55663", email: "mahesh@jpmetals.in", isPrimary: true },
  },
  {
    name: "Kaveri Automation",
    industry: Industry.ELECTRONICS,
    city: "Mysore",
    size: "11-50",
    website: "kaveriauto.in",
    annualPotential: 2800000,
    source: DealSource.COLD_OUTREACH,
    notes: "Automation panels and PCB enclosures. Growing fast, needs reliable sheet metal partner.",
    contact: { name: "Naveen Kumar", role: "Co-Founder", phone: "+91 98860 22114", email: "naveen@kaveriauto.in", isPrimary: true },
  },
  {
    name: "Lakshmi Precision Engineering",
    industry: Industry.AEROSPACE,
    city: "Bengaluru",
    size: "201-500",
    website: "lakshmiprecision.com",
    annualPotential: 15000000,
    source: DealSource.REFERRAL,
    notes: "5-axis CNC machining for aerospace turbines. Highest-value customer. Consistent monthly orders.",
    contact: { name: "Arjun Reddy", role: "General Manager", phone: "+91 98450 99001", email: "arjun@lakshmiprecision.com", isPrimary: true },
  },
  {
    name: "Malabar Marine Components",
    industry: Industry.INDUSTRIAL,
    city: "Kochi",
    size: "51-200",
    website: "malabarmarine.in",
    annualPotential: 4200000,
    source: DealSource.WEBSITE,
    notes: "Marine grade stainless fittings and valves. Corrosion-resistant speciality work.",
    contact: { name: "Thomas Mathew", role: "Works Manager", phone: "+91 94470 11200", email: "thomas@malabarmarine.in", isPrimary: true },
  },
  {
    name: "Narmada Electronics Manufacturing",
    industry: Industry.ELECTRONICS,
    city: "Surat",
    size: "101-200",
    website: "narmadaelec.com",
    annualPotential: 4900000,
    source: DealSource.TRADE_SHOW,
    notes: "EMS provider for consumer electronics. Needs aluminium enclosures and heatsinks in volume.",
    contact: { name: "Ketan Patel", role: "Sourcing Lead", phone: "+91 90990 77882", email: "ketan@narmadaelec.com", isPrimary: true },
  },
  {
    name: "Saraswati Valves & Fittings",
    industry: Industry.INDUSTRIAL,
    city: "Rajkot",
    size: "201-500",
    website: "saraswativalves.in",
    annualPotential: 6800000,
    source: DealSource.REFERRAL,
    notes: "Brass and SS valve bodies. High-volume, competitive pricing. Quality conscious.",
    contact: { name: "Bharat Gohel", role: "Director", phone: "+91 94260 33441", email: "bharat@saraswativalves.in", isPrimary: true },
  },
];

// ─── Deal + RFQ templates ──────────────────────────────────────────────

interface SeedRfq {
  partName: string;
  partNo: string;
  material: string;
  qty: number;
  tolerance: string;
  targetPrice: number;
  deadlineDays: number;
  drawingNotes: string;
  source: RfqSource;
}

interface SeedDeal {
  companyIdx: number;
  title: string;
  value: number;
  stage: DealStage;
  leadScore: LeadScore;
  ageDays: number;
  lostReason?: string;
  rfq?: SeedRfq;
  quoteStatus?: QuoteStatus;
  expectedCloseDays?: number;
}

const DEALS: SeedDeal[] = [
  // ── NEW_RFQ (8) — fresh, no quotes yet ──
  { companyIdx: 0, title: "Ashoka — Transmission Shaft Batch", value: 480000, stage: DealStage.NEW_RFQ, leadScore: LeadScore.HOT, ageDays: 1,
    rfq: { partName: "Transmission Main Shaft", partNo: "TM-450-A", material: "EN24", qty: 500, tolerance: "±0.02mm", targetPrice: 950, deadlineDays: 45, drawingNotes: "Through-hardened, ground journal Ø32mm", source: RfqSource.EMAIL } },
  { companyIdx: 4, title: "Eagle — Landing Gear Forging", value: 1250000, stage: DealStage.NEW_RFQ, leadScore: LeadScore.HOT, ageDays: 2,
    rfq: { partName: "Landing Gear Strut Forging", partNo: "LG-7075-F12", material: "Aluminium 7075", qty: 40, tolerance: "±0.05mm", targetPrice: 31000, deadlineDays: 90, drawingNotes: "Closed-die forging, flash trimmed, solution treated", source: RfqSource.WEBSITE } },
  { companyIdx: 6, title: "Himalaya — Titanium Bone Plate", value: 320000, stage: DealStage.NEW_RFQ, leadScore: LeadScore.HOT, ageDays: 1,
    rfq: { partName: "Distal Femur Locking Plate", partNo: "MED-LP-DF-12L", material: "Titanium Grade 5", qty: 200, tolerance: "±0.01mm", targetPrice: 1600, deadlineDays: 60, drawingNotes: "Anodised gold, screw holes chamfered, laser-marked", source: RfqSource.REFERRAL } },
  { companyIdx: 8, title: "Kaveri — Automation Panel Housing", value: 145000, stage: DealStage.NEW_RFQ, leadScore: LeadScore.WARM, ageDays: 3,
    rfq: { partName: "Wall-mount Panel Enclosure 600×400×200", partNo: "ENC-600400-IP65", material: "SS304", qty: 120, tolerance: "±0.1mm", targetPrice: 1200, deadlineDays: 35, drawingNotes: "IP65, hinged door, cable glands not included", source: RfqSource.WEBSITE } },
  { companyIdx: 11, title: "Malabar — Marine Butterfly Valve Body", value: 580000, stage: DealStage.NEW_RFQ, leadScore: LeadScore.WARM, ageDays: 4,
    rfq: { partName: "DN150 Butterfly Valve Body", partNo: "BV-DN150-316L", material: "SS316", qty: 300, tolerance: "±0.05mm", targetPrice: 1950, deadlineDays: 50, drawingNotes: " investment cast body, machined flange faces", source: RfqSource.EMAIL } },
  { companyIdx: 3, title: "Dharani — Conveyor Drive Frame", value: 380000, stage: DealStage.NEW_RFQ, leadScore: LeadScore.WARM, ageDays: 5,
    rfq: { partName: "Belt Conveyor Drive Frame 3m", partNo: "CV-DFRAME-3000", material: "MS", qty: 15, tolerance: "±1mm", targetPrice: 25000, deadlineDays: 30, drawingNotes: "Welded fabrication, surface ground mounting pads", source: RfqSource.PHONE } },
  { companyIdx: 13, title: "Saraswati — Brass Valve Cartridge", value: 220000, stage: DealStage.NEW_RFQ, leadScore: LeadScore.COLD, ageDays: 6,
    rfq: { partName: "Mixer Cartridge Body", partNo: "SV-CART-35", material: "Brass", qty: 2000, tolerance: "±0.05mm", targetPrice: 110, deadlineDays: 40, drawingNotes: "Chrome-plated after machining, ceramic disc seat", source: RfqSource.WHATSAPP } },
  { companyIdx: 9, title: "Jaipur Metals — Bronze Bush", value: 95000, stage: DealStage.NEW_RFQ, leadScore: LeadScore.COLD, ageDays: 7,
    rfq: { partName: "Phosphor Bronze Bushing", partNo: "JM-BU-PB-45", material: "Brass", qty: 1500, tolerance: "±0.02mm", targetPrice: 65, deadlineDays: 35, drawingNotes: "Centrifugally cast, oil grooves machined", source: RfqSource.WEBSITE } },

  // ── CONTACTED (5) — initial outreach, no quotes yet ──
  { companyIdx: 1, title: "Bharat CNC — Gear Housing", value: 680000, stage: DealStage.CONTACTED, leadScore: LeadScore.HOT, ageDays: 10,
    rfq: { partName: "5-Speed Gearbox Housing", partNo: "BC-GH-5S-Al", material: "Aluminium 6061", qty: 800, tolerance: "±0.05mm", targetPrice: 850, deadlineDays: 50, drawingNotes: "Sand cast blank + CNC finishing, bore Ø85H7", source: RfqSource.EMAIL } },
  { companyIdx: 7, title: "Indus Tooling — Injection Mould Base", value: 920000, stage: DealStage.CONTACTED, leadScore: LeadScore.HOT, ageDays: 12,
    rfq: { partName: "Multi-cavity Mould Base 400×500", partNo: "IT-MB-450-A", material: "EN8", qty: 6, tolerance: "±0.02mm", targetPrice: 152000, deadlineDays: 75, drawingNotes: "Hardened to 32 HRC, pillar bush arrangement included", source: RfqSource.WEBSITE } },
  { companyIdx: 10, title: "Lakshmi — Turbine Disc", value: 2100000, stage: DealStage.CONTACTED, leadScore: LeadScore.HOT, ageDays: 8,
    rfq: { partName: "LP Turbine Stage-3 Disc", partNo: "LP-TB-D3-718", material: "Inconel 718", qty: 12, tolerance: "±0.01mm", targetPrice: 175000, deadlineDays: 120, drawingNotes: "5-axis finishing, fir-tree root, balanced to G2.5", source: RfqSource.REFERRAL } },
  { companyIdx: 12, title: "Narmada — Heatsink Extrusion", value: 180000, stage: DealStage.CONTACTED, leadScore: LeadScore.WARM, ageDays: 14,
    rfq: { partName: "Aluminium Extruded Heatsink 200mm", partNo: "NE-HS-200-45FIN", material: "Aluminium 6061", qty: 3000, tolerance: "±0.2mm", targetPrice: 60, deadlineDays: 30, drawingNotes: "45 fins, anodised black, cut to 200mm length", source: RfqSource.REFERRAL } },
  { companyIdx: 5, title: "Frontier — Server Rack Panel", value: 260000, stage: DealStage.CONTACTED, leadScore: LeadScore.WARM, ageDays: 9,
    rfq: { partName: "1U Rack Mount Front Panel", partNo: "FR-1U-19-STD", material: "SS304", qty: 2000, tolerance: "±0.1mm", targetPrice: 130, deadlineDays: 35, drawingNotes: "Brushed finish, PEM studs, silk-screened logo", source: RfqSource.EMAIL } },

  // ── QUOTE_SENT (7) — quotes sent, awaiting response ──
  { companyIdx: 0, title: "Ashoka — Brake Caliper Bracket (Repeat)", value: 720000, stage: DealStage.QUOTE_SENT, leadScore: LeadScore.HOT, ageDays: 18,
    rfq: { partName: "Front Brake Caliper Bracket", partNo: "ASH-BC-FR-V2", material: "SG Iron", qty: 1200, tolerance: "±0.05mm", targetPrice: 600, deadlineDays: 45, drawingNotes: "Ductile iron casting, machined mounting bores", source: RfqSource.EMAIL },
    quoteStatus: QuoteStatus.SENT },
  { companyIdx: 10, title: "Lakshmi — Compressor Impeller", value: 1450000, stage: DealStage.QUOTE_SENT, leadScore: LeadScore.HOT, ageDays: 16,
    rfq: { partName: "Centrifugal Compressor Impeller", partNo: "LP-CI-22-AL", material: "Aluminium 7075", qty: 25, tolerance: "±0.01mm", targetPrice: 58000, deadlineDays: 60, drawingNotes: "5-axis machined from billet, dynamically balanced", source: RfqSource.WEBSITE },
    quoteStatus: QuoteStatus.SENT },
  { companyIdx: 4, title: "Eagle — Wing Rib Fitting", value: 890000, stage: DealStage.QUOTE_SENT, leadScore: LeadScore.HOT, ageDays: 22,
    rfq: { partName: "Wing Rib Attachment Fitting", partNo: "EF-WRF-7075-T6", material: "Aluminium 7075", qty: 60, tolerance: "±0.02mm", targetPrice: 14800, deadlineDays: 75, drawingNotes: "From forged blank, anodised, dimensional report", source: RfqSource.EMAIL },
    quoteStatus: QuoteStatus.SENT },
  { companyIdx: 2, title: "Coromandel — Turbine Blade Cast", value: 1650000, stage: DealStage.QUOTE_SENT, leadScore: LeadScore.WARM, ageDays: 20,
    rfq: { partName: "HP Turbine Blade Investment Cast", partNo: "CC-TB-HP-IN718", material: "Inconel 718", qty: 48, tolerance: "±0.03mm", targetPrice: 34000, deadlineDays: 90, drawingNotes: "Investment casting, HIP treated, fettled", source: RfqSource.REFERRAL },
    quoteStatus: QuoteStatus.SENT },
  { companyIdx: 13, title: "Saraswati — SS Ball Valve", value: 540000, stage: DealStage.QUOTE_SENT, leadScore: LeadScore.WARM, ageDays: 25,
    rfq: { partName: "DN50 3-Piece Ball Valve Body", partNo: "SV-BV-3P-DN50", material: "SS316", qty: 500, tolerance: "±0.05mm", targetPrice: 1080, deadlineDays: 50, drawingNotes: "Investment cast + machined, ISO 5211 mounting pad", source: RfqSource.WEBSITE },
    quoteStatus: QuoteStatus.SENT },
  { companyIdx: 1, title: "Bharat — Selector Fork", value: 340000, stage: DealStage.QUOTE_SENT, leadScore: LeadScore.WARM, ageDays: 15,
    rfq: { partName: "Gearbox Selector Fork", partNo: "BC-SF-3-4", material: "Forged Steel", qty: 2000, tolerance: "±0.1mm", targetPrice: 170, deadlineDays: 40, drawingNotes: "Hot forged + CNC profile milled, induction hardened", source: RfqSource.EMAIL },
    quoteStatus: QuoteStatus.SENT },
  { companyIdx: 6, title: "Himalaya — Surgical Retractor", value: 195000, stage: DealStage.QUOTE_SENT, leadScore: LeadScore.WARM, ageDays: 19,
    rfq: { partName: "Self-Retaining Weitlaner Retractor", partNo: "MED-RET-WL-180", material: "SS316", qty: 800, tolerance: "±0.05mm", targetPrice: 245, deadlineDays: 45, drawingNotes: "Mirror finish, passivated, laser-marked CE", source: RfqSource.WEBSITE },
    quoteStatus: QuoteStatus.SENT },

  // ── NEGOTIATION (4) — active back-and-forth ──
  { companyIdx: 7, title: "Indus — Hot Runner Manifold", value: 1850000, stage: DealStage.NEGOTIATION, leadScore: LeadScore.HOT, ageDays: 30,
    rfq: { partName: "4-Cavity Hot Runner Manifold", partNo: "IT-HRM-4C-STD", material: "SS420", qty: 4, tolerance: "±0.01mm", targetPrice: 462000, deadlineDays: 90, drawingNotes: "Hardened SS420, flow-balanced, heater bores precision-bored", source: RfqSource.REFERRAL },
    quoteStatus: QuoteStatus.SENT },
  { companyIdx: 10, title: "Lakshmi — Engine Mount Bracket", value: 980000, stage: DealStage.NEGOTIATION, leadScore: LeadScore.HOT, ageDays: 28,
    rfq: { partName: "Aft Engine Mount Bracket", partNo: "LP-EMB-AFT-TI", material: "Titanium Grade 5", qty: 20, tolerance: "±0.02mm", targetPrice: 49000, deadlineDays: 75, drawingNotes: "5-axis machined from forged billet, etch inspected", source: RfqSource.REFERRAL },
    quoteStatus: QuoteStatus.SENT },
  { companyIdx: 0, title: "Ashoka — Steering Knuckle", value: 860000, stage: DealStage.NEGOTIATION, leadScore: LeadScore.HOT, ageDays: 26,
    rfq: { partName: "Front Steering Knuckle", partNo: "ASH-SK-FR-D55", material: "Ductile Iron", qty: 600, tolerance: "±0.05mm", targetPrice: 1430, deadlineDays: 55, drawingNotes: "SG60 casting, machined spindle bore, bearing seats", source: RfqSource.EMAIL },
    quoteStatus: QuoteStatus.SENT },
  { companyIdx: 2, title: "Coromandel — Structural Bracket", value: 420000, stage: DealStage.NEGOTIATION, leadScore: LeadScore.WARM, ageDays: 24,
    rfq: { partName: "Fuselage Structural Bracket", partNo: "CC-SB-FS-Ti", material: "Titanium Grade 5", qty: 80, tolerance: "±0.03mm", targetPrice: 5250, deadlineDays: 60, drawingNotes: "Investment cast + machined, etch inspected, serial marked", source: RfqSource.EMAIL },
    quoteStatus: QuoteStatus.SENT },

  // ── WON (4) — closed won, orders created ──
  { companyIdx: 10, title: "Lakshmi — Compressor Housing (Won)", value: 2400000, stage: DealStage.WON, leadScore: LeadScore.HOT, ageDays: 45,
    rfq: { partName: "Bleed Air Compressor Housing", partNo: "LP-CH-BA-Al", material: "Aluminium 6061", qty: 30, tolerance: "±0.02mm", targetPrice: 80000, deadlineDays: 90, drawingNotes: "Sand cast + 5-axis finish, pressure tested to 8 bar", source: RfqSource.REFERRAL },
    quoteStatus: QuoteStatus.ACCEPTED },
  { companyIdx: 0, title: "Ashoka — Wheel Hub (Won)", value: 680000, stage: DealStage.WON, leadScore: LeadScore.HOT, ageDays: 40,
    rfq: { partName: "Rear Wheel Hub Assembly", partNo: "ASH-WH-RR-V3", material: "Forged Steel", qty: 1000, tolerance: "±0.05mm", targetPrice: 680, deadlineDays: 45, drawingNotes: "Hot forged + turned + ground bearing journal", source: RfqSource.EMAIL },
    quoteStatus: QuoteStatus.ACCEPTED },
  { companyIdx: 7, title: "Indus — Die Set (Won)", value: 1150000, stage: DealStage.WON, leadScore: LeadScore.HOT, ageDays: 52,
    rfq: { partName: "Progressive Die Set for Bracket", partNo: "IT-DS-PROG-BRK", material: "D2 Tool Steel", qty: 2, tolerance: "±0.01mm", targetPrice: 575000, deadlineDays: 100, drawingNotes: "Hardened to 60 HRC, wire-cut profiles, tryout included", source: RfqSource.REFERRAL },
    quoteStatus: QuoteStatus.ACCEPTED },
  { companyIdx: 13, title: "Saraswati — Brass Manifold (Won)", value: 450000, stage: DealStage.WON, leadScore: LeadScore.WARM, ageDays: 48,
    rfq: { partName: "6-Port Brass Manifold Block", partNo: "SV-MAN-6P-BR", material: "Brass", qty: 400, tolerance: "±0.05mm", targetPrice: 1125, deadlineDays: 40, drawingNotes: "Sand cast + machined, nickel-plated, NPT threads", source: RfqSource.WEBSITE },
    quoteStatus: QuoteStatus.ACCEPTED },

  // ── LOST (2) — closed lost with reasons ──
  { companyIdx: 5, title: "Frontier — Enclosure (Lost)", value: 380000, stage: DealStage.LOST, leadScore: LeadScore.COLD, ageDays: 35, lostReason: "Price too high — lost to competitor on cost",
    rfq: { partName: "Outdoor Telecom Enclosure", partNo: "FR-ENC-OD-IP66", material: "SS304", qty: 500, tolerance: "±0.1mm", targetPrice: 760, deadlineDays: 40, drawingNotes: "IP66, powder coated, thermal management cutouts", source: RfqSource.REFERRAL },
    quoteStatus: QuoteStatus.REJECTED },
  { companyIdx: 8, title: "Kaveri — PCB Carrier (Lost)", value: 160000, stage: DealStage.LOST, leadScore: LeadScore.COLD, ageDays: 30, lostReason: "Customer delayed project indefinitely",
    rfq: { partName: "Aluminium PCB Carrier Rail", partNo: "KA-PCR-300", material: "Aluminium 6061", qty: 3000, tolerance: "±0.1mm", targetPrice: 53, deadlineDays: 25, drawingNotes: "Extrusion + cut + anodise, no machining", source: RfqSource.WEBSITE },
    quoteStatus: QuoteStatus.REJECTED },
];

// ─── Generate realistic quote line items ───────────────────────────────

function buildLineItems(rfq: SeedRfq): { description: string; qty: number; unitPrice: number }[] {
  const materialRates: Record<string, number> = {
    "SS304": 280, "SS316": 350, "SS316L": 380, "SS420": 420, "MS": 85, "SG Iron": 95, "Ductile Iron": 110,
    "Aluminium 6061": 320, "Aluminium 7075": 550, "Brass": 420, "EN8": 140, "EN24": 180,
    "Titanium Grade 5": 2400, "Inconel 718": 4200, "D2 Tool Steel": 650, "Forged Steel": 120,
    "Phosphor Bronze": 520,
  };
  const rate = materialRates[rfq.material] ?? 200;
  const estWeight = rfq.qty > 1000 ? 0.2 : rfq.qty > 100 ? 1.2 : 3.5;
  const tightTol = rfq.tolerance.includes("0.01") || rfq.tolerance.includes("0.02");
  const tolPremium = tightTol ? 1.25 : 1.0;

  const materialUnit = Math.round((rate * estWeight * tolPremium) / 1) + 20;
  const machiningUnit = Math.round((tightTol ? 850 : 500) * tolPremium);
  const finishingUnit = Math.round(90 + (rfq.material.includes("SS") ? 40 : 20));
  const qcUnit = tightTol ? 60 : 35;
  const packagingUnit = rfq.qty > 1000 ? 25 : 80;
  const toolingUnit = rfq.qty < 50 ? Math.round(8000 / rfq.qty) : 0;

  const items = [
    { description: `${rfq.material} raw material — approx ${estWeight}kg/pc`, qty: rfq.qty, unitPrice: materialUnit },
    { description: `CNC machining — ${rfq.partName}`, qty: rfq.qty, unitPrice: machiningUnit },
    { description: "Surface finishing, deburring & cleaning", qty: rfq.qty, unitPrice: finishingUnit },
    { description: "In-process & final inspection, dimensional report", qty: rfq.qty, unitPrice: qcUnit },
    { description: "Packaging & dispatch (vacuum-sealed, labelled)", qty: rfq.qty, unitPrice: packagingUnit },
  ];
  if (toolingUnit > 0) {
    items.push({ description: "Tooling / setup (one-time)", qty: 1, unitPrice: toolingUnit * rfq.qty });
  }
  return items;
}

function buildTerms(rfq: SeedRfq): string[] {
  const highValue = rfq.targetPrice * rfq.qty > 1000000;
  return [
    highValue ? "40% advance with PO, 50% on inspection, 10% before dispatch" : "50% advance with PO, balance before dispatch",
    `Delivery: ${Math.ceil(rfq.deadlineDays * 0.8)} working days from order confirmation and drawing approval`,
    "Warranty: 30 days against manufacturing defects from date of dispatch",
    "Prices valid for 30 days, ex-works Bengaluru. GST extra at applicable rates.",
    `Tolerance: ${rfq.tolerance} on critical dimensions, general tolerance per IS 2102`,
  ];
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  loadEnvFile();
  const prisma = new PrismaClient();
  const actorId = process.env.SEED_OWNER_ID ?? "";
  if (!actorId) throw new Error("SEED_OWNER_ID must be set in .env");

  try {
    // Find the shop
    const shop = await prisma.shop.findFirst({ orderBy: { createdAt: "asc" } });
    if (!shop) throw new Error("No shop found. Create a shop first.");
    const shopId = shop.id;
    console.log(`Using shop: ${shop.name} (${shopId})`);

    // ── 1. WIPE ────────────────────────────────────────────────────────
    console.log("Wiping existing demo data…");
    await prisma.activity.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.quote.deleteMany({});
    await prisma.rfq.deleteMany({});
    await prisma.deal.deleteMany({});
    await prisma.contact.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.dashboardSnapshot.deleteMany({});
    await prisma.aiQuoteCache.deleteMany({});
    await prisma.askCache.deleteMany({});
    await prisma.auditLog.deleteMany({});
    console.log("  Wipe complete.\n");

    // ── 2. COMPANIES ───────────────────────────────────────────────────
    console.log("Creating 14 companies…");
    const companyIds: string[] = [];
    for (const c of COMPANIES) {
      const company = await prisma.company.create({
        data: {
          shopId,
          name: c.name,
          industry: c.industry,
          city: c.city,
          size: c.size,
          website: c.website,
          annualPotential: c.annualPotential,
          source: c.source,
          notes: c.notes,
          contacts: {
            create: {
              shopId,
              name: c.contact.name,
              role: c.contact.role,
              phone: c.contact.phone,
              email: c.contact.email,
              isPrimary: c.contact.isPrimary,
            },
          },
        },
      });
      companyIds.push(company.id);
    }
    console.log("  14 companies created.\n");

    // ── 3. DEALS + RFQs + QUOTES ───────────────────────────────────────
    console.log("Creating 30 deals with RFQs and quotes…");
    let quoteCounter = 0;
    let orderCounter = 0;
    const year = new Date().getFullYear();
    const now = new Date();

    for (let i = 0; i < DEALS.length; i++) {
      const d = DEALS[i];
      const companyId = companyIds[d.companyIdx];
      const createdAt = new Date(now.getTime() - d.ageDays * 86400000);
      const expectedClose = d.expectedCloseDays ? new Date(now.getTime() + d.expectedCloseDays * 86400000) : null;

      const deal = await prisma.deal.create({
        data: {
          shopId,
          title: d.title,
          companyId,
          value: d.value,
          stage: d.stage,
          leadScore: d.leadScore,
          lostReason: d.lostReason ?? null,
          expectedClose,
          source: d.rfq?.source ? (d.rfq.source === RfqSource.WEBSITE ? DealSource.WEBSITE : DealSource.RFQ_PORTAL) : DealSource.WEBSITE,
          createdAt,
          updatedAt: new Date(createdAt.getTime() + Math.random() * 86400000 * 2),
        },
      });

      // RFQ
      if (d.rfq) {
        const rfq = d.rfq;
        await prisma.rfq.create({
          data: {
            shopId,
            dealId: deal.id,
            companyId,
            partName: rfq.partName,
            partNo: rfq.partNo,
            material: rfq.material,
            qty: rfq.qty,
            tolerance: rfq.tolerance,
            targetPrice: rfq.targetPrice,
            deadline: new Date(now.getTime() + rfq.deadlineDays * 86400000),
            drawingNotes: rfq.drawingNotes,
            source: rfq.source,
            createdAt,
          },
        });
      }

      // Quote
      if (d.quoteStatus && d.rfq) {
        quoteCounter++;
        const lineItems = buildLineItems(d.rfq);
        const terms = buildTerms(d.rfq);
        const totalAmount = lineItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
        const quoteNo = `Q-${year}-${String(quoteCounter).padStart(4, "0")}`;
        const quoteCreated = new Date(createdAt.getTime() + 2 * 86400000);
        const quote = await prisma.quote.create({
          data: {
            shopId,
            dealId: deal.id,
            quoteNo,
            status: d.quoteStatus,
            totalAmount,
            validUntil: new Date(quoteCreated.getTime() + 30 * 86400000),
            aiGenerated: true,
            lineItems: lineItems as any,
            terms: terms as any,
            createdAt: quoteCreated,
            updatedAt: quoteCreated,
          },
        });

        // Order for WON deals
        if (d.stage === DealStage.WON) {
          orderCounter++;
          const orderNo = `ORD-${year}-${String(orderCounter).padStart(4, "0")}`;
          await prisma.order.create({
            data: {
              shopId,
              dealId: deal.id,
              orderNo,
              totalAmount,
              status: OrderStatus.PENDING,
              createdAt: new Date(quoteCreated.getTime() + 3 * 86400000),
            },
          });
        }
      }

      // Activities — staged timeline
      const acts: { type: ActivityType; description: string; offsetDays: number }[] = [
        { type: ActivityType.NOTE, description: `RFQ received and logged`, offsetDays: 0 },
      ];

      if (d.stage !== DealStage.NEW_RFQ) {
        acts.push({ type: ActivityType.STAGE_CHANGE, description: `Stage changed: NEW_RFQ → CONTACTED`, offsetDays: 2 });
      }
      if (d.rfq && (d.stage === DealStage.QUOTE_SENT || d.stage === DealStage.NEGOTIATION || d.stage === DealStage.WON)) {
        acts.push({ type: ActivityType.NOTE, description: `Quote drafted with AI and reviewed`, offsetDays: 4 });
        acts.push({ type: ActivityType.QUOTE_SENT, description: `Quote sent to customer`, offsetDays: 5 });
        acts.push({ type: ActivityType.STAGE_CHANGE, description: `Stage changed: CONTACTED → QUOTE_SENT`, offsetDays: 5 });
      }
      if (d.stage === DealStage.NEGOTIATION) {
        acts.push({ type: ActivityType.NOTE, description: `Customer requested price revision — negotiating`, offsetDays: 10 });
        acts.push({ type: ActivityType.STAGE_CHANGE, description: `Stage changed: QUOTE_SENT → NEGOTIATION`, offsetDays: 10 });
      }
      if (d.stage === DealStage.WON) {
        acts.push({ type: ActivityType.STAGE_CHANGE, description: `Stage changed: NEGOTIATION → WON`, offsetDays: 15 });
        acts.push({ type: ActivityType.DEAL_WON, description: `Deal won — order created`, offsetDays: 15 });
      }
      if (d.stage === DealStage.LOST) {
        acts.push({ type: ActivityType.STAGE_CHANGE, description: `Stage changed: QUOTE_SENT → LOST`, offsetDays: 12 });
        acts.push({ type: ActivityType.DEAL_LOST, description: `Deal lost: ${d.lostReason}`, offsetDays: 12 });
      }

      for (const a of acts) {
        await prisma.activity.create({
          data: {
            shopId,
            dealId: deal.id,
            companyId,
            type: a.type,
            description: a.description,
            metadata: {},
            actorId,
            createdAt: new Date(createdAt.getTime() + a.offsetDays * 86400000),
          },
        });
      }
    }
    console.log(`  30 deals, ${DEALS.filter(d => d.rfq).length} RFQs, ${quoteCounter} quotes, ${orderCounter} orders created.\n`);

    // ── 4. TASKS ───────────────────────────────────────────────────────
    console.log("Creating tasks…");
    const tasks = [
      { dealIdx: 0, type: TaskType.FOLLOW_UP, message: "Call Rajesh to confirm RFQ details — transmission shaft specs", dueOffset: -1 },
      { dealIdx: 1, type: TaskType.FOLLOW_UP, message: "Send material certification samples to Eagle Forgings", dueOffset: 1 },
      { dealIdx: 4, type: TaskType.CALL, message: "Follow up with Malabar Marine on butterfly valve quote", dueOffset: -2 },
      { dealIdx: 14, type: TaskType.FOLLOW_UP, message: "Follow up on Q-2026-0001 — Ashoka brake caliper bracket", dueOffset: -3 },
      { dealIdx: 15, type: TaskType.FOLLOW_UP, message: "Lakshmi compressor impeller — customer reviewing quote", dueOffset: 2 },
      { dealIdx: 16, type: TaskType.RENEGOTIATE, message: "Eagle wing rib — counter-offer discussion scheduled", dueOffset: 3 },
      { dealIdx: 18, type: TaskType.SEND_QUOTE, message: "Saraswati ball valve — resend quote with revised terms", dueOffset: -1 },
      { dealIdx: 21, type: TaskType.MEETING, message: "Indus hot runner manifold — site visit for technical review", dueOffset: 5 },
      { dealIdx: 22, type: TaskType.RENEGOTIATE, message: "Lakshmi engine mount — price negotiation round 2", dueOffset: -1 },
      { dealIdx: 10, type: TaskType.CALL, message: "Lakshmi turbine disc — technical clarification call", dueOffset: 0 },
    ];

    // We need deal IDs — fetch them by title
    const allDeals = await prisma.deal.findMany({ select: { id: true, title: true } });
    const dealByTitle = new Map(allDeals.map(d => [d.title, d.id]));

    for (const t of tasks) {
      const dealTitle = DEALS[t.dealIdx].title;
      const dealId = dealByTitle.get(dealTitle);
      if (!dealId) continue;
      const companyIdx = DEALS[t.dealIdx].companyIdx;
      await prisma.task.create({
        data: {
          shopId,
          dealId,
          companyId: companyIds[companyIdx],
          type: t.type,
          status: TaskStatus.DUE,
          dueAt: new Date(now.getTime() + t.dueOffset * 86400000),
          message: t.message,
          autoCreated: false,
          createdBy: actorId,
        },
      });
    }
    console.log(`  ${tasks.length} tasks created.\n`);

    // ── 5. DASHBOARD SNAPSHOTS — 60 days (batched) ────────────────────
    console.log("Creating 60-day dashboard snapshots…");
    const snapData: { date: Date; pipelineValue: number; dealsOpen: number }[] = [];
    const basePipeline = 4500000;
    const baseDeals = 12;
    for (let i = 59; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 86400000);
      date.setHours(0, 0, 0, 0);
      const progress = (59 - i) / 59;
      const trend = basePipeline * (1 + progress * 0.8);
      const noise = (Math.sin(i * 0.7) + Math.cos(i * 0.3)) * 300000;
      const pipelineValue = Math.round(trend + noise);
      const dealsOpen = Math.round(baseDeals + progress * 12 + Math.sin(i * 0.5) * 3);
      snapData.push({ date, pipelineValue, dealsOpen });
    }
    await prisma.dashboardSnapshot.createMany({ data: snapData });
    console.log("  60 snapshots created.\n");

    // ── 6. ASK CACHE — pre-populate common questions ───────────────────
    console.log("Pre-populating Ask cache…");
    const crypto = await import("node:crypto");
    const cachedQAs: { q: string; a: string }[] = [
      { q: "what is my total pipeline value", a: "Your open pipeline is **₹83.2L** across 24 active deals. The largest is Lakshmi — Turbine Disc at ₹21.0L (Lakshmi Precision Engineering), currently in Contacted stage." },
      { q: "which deals are overdue for follow-up", a: "**4 deals** need immediate attention:\n• Q-2026-0001 — Ashoka brake caliper bracket, follow-up 3 days overdue\n• Malabar Marine butterfly valve — 2 days overdue\n• Saraswati ball valve quote — resend pending, 1 day overdue\n• Lakshmi engine mount — price negotiation overdue by 1 day" },
      { q: "what is my win rate this quarter", a: "Win rate: **66.7%** — 4 deals won, 2 lost in the last 90 days. Total won value: ₹46.8L." },
      { q: "which rfqs are waiting for a quote", a: "**8 RFQs** are in New RFQ stage awaiting quote:\n• Ashoka — Transmission Shaft Batch (₹4.8L, HOT)\n• Eagle — Landing Gear Forging (₹12.5L, HOT)\n• Himalaya — Titanium Bone Plate (₹3.2L, HOT)\n• Kaveri — Automation Panel Housing (₹1.5L)\n• Malabar — Marine Butterfly Valve Body (₹5.8L)\n• Dharani — Conveyor Drive Frame (₹3.8L)\n• Saraswati — Brass Valve Cartridge (₹2.2L)\n• Jaipur Metals — Bronze Bush (₹0.95L)" },
    ];
    for (const qa of cachedQAs) {
      const hash = crypto.createHash("sha256").update(JSON.stringify({ q: qa.q.toLowerCase().trim() })).digest("hex");
      await prisma.askCache.create({ data: { questionHash: hash, answer: qa.a } }).catch(() => {});
    }
    console.log(`  ${cachedQAs.length} cached answers created.\n`);

    // ── SUMMARY ────────────────────────────────────────────────────────
    const counts = await Promise.all([
      prisma.company.count(),
      prisma.deal.count(),
      prisma.rfq.count(),
      prisma.quote.count(),
      prisma.order.count(),
      prisma.task.count(),
      prisma.activity.count(),
      prisma.dashboardSnapshot.count(),
    ]);
    console.log("═══════════════════════════════════════════");
    console.log("  SEED COMPLETE");
    console.log("═══════════════════════════════════════════");
    console.log(`  Companies:   ${counts[0]}`);
    console.log(`  Deals:       ${counts[1]}`);
    console.log(`  RFQs:        ${counts[2]}`);
    console.log(`  Quotes:      ${counts[3]}`);
    console.log(`  Orders:      ${counts[4]}`);
    console.log(`  Tasks:       ${counts[5]}`);
    console.log(`  Activities:  ${counts[6]}`);
    console.log(`  Snapshots:   ${counts[7]}`);
    console.log("═══════════════════════════════════════════\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
