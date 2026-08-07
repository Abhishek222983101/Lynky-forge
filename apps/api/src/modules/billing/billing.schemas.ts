import { MakingChargeType, PaymentMethod } from "@prisma/client";
import Decimal from "decimal.js";

export type BillingItemInput = {
  inventoryItemId?: string | null;
  itemName: string;
  purity: string;
  grossWeight: Decimal.Value;
  netWeight: Decimal.Value;
  goldRatePerGram: Decimal.Value;
  makingChargeType: MakingChargeType;
  makingChargeValue: Decimal.Value;
  hallmarkingChargeAmount?: Decimal.Value;
  huidNumber?: string | null;
};

export type BillingInput = {
  items: BillingItemInput[];
  amountPaid: Decimal.Value;
  paymentMethod: PaymentMethod;
};

export type BillingLine = {
  item: BillingItemInput;
  goldAmount: Decimal;
  makingChargeAmount: Decimal;
  lineSubtotal: Decimal;
  gstAmount: Decimal;
  lineTotal: Decimal;
};

export type BillingTotals = {
  lines: BillingLine[];
  subtotalAmount: Decimal;
  makingChargeAmount: Decimal;
  hallmarkingChargeAmount: Decimal;
  gstAmount: Decimal;
  totalAmount: Decimal;
  amountPaid: Decimal;
  pendingAmount: Decimal;
  paymentStatus: "paid" | "partial" | "pending";
};
