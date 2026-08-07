import { parseSaleTranscript } from "./voice.parser";
import { classifyConfirmation } from "./confirmation";

describe("voice parser", () => {
  it("extracts structured sale payload from a transcript", () => {
    const parsed = parseSaleTranscript("Sold 22 carat chain 18.5 grams making 12 percent to Lakshmi. Received 50000 cash rest pending.");
    expect(parsed.intent).toBe("record_sale");
    expect(parsed.customer?.name).toBe("Lakshmi");
    expect(parsed.items?.[0]).toMatchObject({
      itemName: "chain",
      purity: "22K",
      grossWeight: "18.5",
      makingChargeValue: "12"
    });
    expect(parsed.payment).toMatchObject({ amountPaid: "50000", paymentMethod: "cash" });
  });

  it("requires missing important numeric values before confirmation", () => {
    const parsed = parseSaleTranscript("Sold chain to Lakshmi");
    expect(parsed.intent).toBe("record_sale");
    expect(parsed.missingFields).toEqual(["purity", "weight"]);
  });

  it("handles browser speech-recognition worded numbers", () => {
    const parsed = parseSaleTranscript("Sold twenty two carat chain eighteen point five grams making twelve percent to Lakshmi. Received fifty thousand cash rest pending.");
    expect(parsed.intent).toBe("record_sale");
    expect(parsed.items?.[0]).toMatchObject({
      itemName: "chain",
      purity: "22K",
      grossWeight: "18.5",
      makingChargeValue: "12"
    });
    expect(parsed.payment).toMatchObject({ amountPaid: "50000", paymentMethod: "cash" });
  });

  it("classifies confirmation decisions", () => {
    expect(classifyConfirmation("yes")).toBe("yes");
    expect(classifyConfirmation("cancel")).toBe("no");
    expect(classifyConfirmation("maybe")).toBe("unknown");
  });
});
