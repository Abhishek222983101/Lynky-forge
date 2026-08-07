import { DeterministicVoiceRouter } from "./deterministic-voice-router";

describe("DeterministicVoiceRouter", () => {
  const router = new DeterministicVoiceRouter();
  const route = (transcript: string) => router.route({ transcript });

  it("routes a complete sale to record_sale_draft with items", async () => {
    const decision = await route("Sold 22 carat chain 18.5 grams making 12 percent to Lakshmi. Received 50000 cash rest pending.");
    expect(decision.action).toBe("record_sale_draft");
    expect(decision.missingFields).toBeUndefined();
    expect((decision.arguments.items as unknown[])?.length).toBe(1);
  });

  it("asks for missing sale values", async () => {
    const decision = await route("Sold chain to Lakshmi");
    expect(decision.action).toBe("record_sale_draft");
    expect(decision.missingFields).toEqual(["purity", "weight"]);
  });

  it("routes customer creation and extracts name + phone", async () => {
    const decision = await route("Add customer Priya 9876543210");
    expect(decision.action).toBe("create_customer");
    expect(decision.arguments.fullName).toBe("Priya");
    expect(decision.arguments.phone).toBe("9876543210");
  });

  it("routes a repair intake with the customer reference", async () => {
    const decision = await route("Create a repair for Lakshmi gold chain");
    expect(decision.action).toBe("create_repair_order");
    expect(decision.arguments.customerName).toBe("Lakshmi");
  });

  it("routes a repair status update with the new status", async () => {
    const decision = await route("Update repair for Lakshmi to ready");
    expect(decision.action).toBe("update_repair_status");
    expect(decision.arguments.status).toBe("ready");
    expect(decision.arguments.customerName).toBe("Lakshmi");
  });

  it("routes owner questions and stock lookups", async () => {
    expect((await route("How much did we sell today?")).action).toBe("ask_owner_cockpit");
    expect((await route("Show stock summary")).action).toBe("stock_summary");
  });

  it("returns unknown with a capability prompt for unsupported commands", async () => {
    const decision = await route("Play some music");
    expect(decision.action).toBe("unknown");
    expect(decision.clarification).toContain("I can help with");
  });
});
