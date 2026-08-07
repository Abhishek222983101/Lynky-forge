import { PaymentMethod } from "@prisma/client";
import { voiceActionList, voiceActionSchemas } from "./voice-actions";
import { VoicePolicyService } from "./voice-policy.service";

describe("voice action registry", () => {
  it("exposes the core voice-first actions", () => {
    const names = voiceActionList().map((action) => action.name);

    expect(names).toContain("record_sale_draft");
    expect(names).toContain("ask_owner_cockpit");
    expect(names).toContain("stock_summary");
    expect(names).toContain("create_repair_order");
    expect(names).toContain("record_scheme_installment");
  });

  it("requires confirmation for sensitive sale recording", () => {
    const policy = new VoicePolicyService();

    expect(policy.requiresConfirmation("record_sale_draft")).toBe(true);
    expect(policy.sensitiveFields("record_sale_draft")).toEqual(expect.arrayContaining(["netWeight", "goldRatePerGram", "amountPaid"]));
    expect(policy.requiresConfirmation("ask_owner_cockpit")).toBe(false);
  });

  it("validates sale action input using the same manual sale contract", () => {
    const parsed = voiceActionSchemas.record_sale_draft.parse({
      items: [{
        itemName: "chain",
        purity: "22K",
        grossWeight: "18.5",
        netWeight: "18.5",
        goldRatePerGram: "7480",
        makingChargeType: "percentage",
        makingChargeValue: "12",
        hallmarkingChargeAmount: "0"
      }],
      amountPaid: "50000",
      paymentMethod: PaymentMethod.cash
    });

    expect(parsed.items[0].purity).toBe("22K");
    expect(parsed.amountPaid).toBe("50000");
  });
});
