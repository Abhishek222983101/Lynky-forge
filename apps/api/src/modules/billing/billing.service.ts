import { Injectable } from "@nestjs/common";
import { MakingChargeType } from "@prisma/client";
import Decimal from "decimal.js";
import { AppError } from "@/common/errors/app-error";
import { decimal, money } from "@/common/utils/decimal";
import { BillingInput, BillingTotals } from "./billing.schemas";

const GST_RATE = new Decimal("0.03");

@Injectable()
export class BillingService {
  calculateSale(input: BillingInput): BillingTotals {
    if (!input.items.length) throw new AppError("At least one sale item is required");
    const lines = input.items.map((item) => {
      const netWeight = decimal(item.netWeight);
      const rate = decimal(item.goldRatePerGram);
      if (netWeight.lte(0) || rate.lte(0)) throw new AppError("Weight and rate must be greater than zero");
      const goldAmount = money(netWeight.mul(rate));
      const makingChargeAmount = item.makingChargeType === MakingChargeType.percentage
        ? money(goldAmount.mul(decimal(item.makingChargeValue)).div(100))
        : money(item.makingChargeValue);
      const hallmark = money(item.hallmarkingChargeAmount ?? 0);
      const lineSubtotal = money(goldAmount.plus(makingChargeAmount).plus(hallmark));
      const gstAmount = money(lineSubtotal.mul(GST_RATE));
      const lineTotal = money(lineSubtotal.plus(gstAmount));
      return { item, goldAmount, makingChargeAmount, lineSubtotal, gstAmount, lineTotal };
    });
    const subtotalAmount = money(lines.reduce((sum, line) => sum.plus(line.goldAmount), new Decimal(0)));
    const makingChargeAmount = money(lines.reduce((sum, line) => sum.plus(line.makingChargeAmount), new Decimal(0)));
    const hallmarkingChargeAmount = money(lines.reduce((sum, line) => sum.plus(decimal(line.item.hallmarkingChargeAmount ?? 0)), new Decimal(0)));
    const gstAmount = money(lines.reduce((sum, line) => sum.plus(line.gstAmount), new Decimal(0)));
    const totalAmount = money(lines.reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0)));
    const amountPaid = money(input.amountPaid);
    if (amountPaid.gt(totalAmount)) throw new AppError("Amount paid cannot exceed total amount");
    const pendingAmount = money(totalAmount.minus(amountPaid));
    const paymentStatus = pendingAmount.eq(0) ? "paid" : amountPaid.eq(0) ? "pending" : "partial";
    return { lines, subtotalAmount, makingChargeAmount, hallmarkingChargeAmount, gstAmount, totalAmount, amountPaid, pendingAmount, paymentStatus };
  }
}
