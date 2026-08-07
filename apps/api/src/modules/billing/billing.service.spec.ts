import { MakingChargeType, PaymentMethod } from "@prisma/client";
import { BillingService } from "./billing.service";

describe("BillingService", () => {
  it("calculates sale totals deterministically", () => {
    const service = new BillingService();
    const totals = service.calculateSale({
      amountPaid: "50000",
      paymentMethod: PaymentMethod.cash,
      items: [{
        itemName: "chain",
        purity: "22K",
        grossWeight: "18.5",
        netWeight: "18.5",
        goldRatePerGram: "6000",
        makingChargeType: MakingChargeType.percentage,
        makingChargeValue: "12"
      }]
    });
    expect(totals.subtotalAmount.toString()).toBe("111000");
    expect(totals.makingChargeAmount.toString()).toBe("13320");
    expect(totals.gstAmount.toString()).toBe("3729.6");
    expect(totals.totalAmount.toString()).toBe("128049.6");
    expect(totals.pendingAmount.toString()).toBe("78049.6");
    expect(totals.paymentStatus).toBe("partial");
  });
});
