import Decimal from "decimal.js";

// Env is validated when the session module loads; only DATABASE_URL is required.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GeminiLiveSession } = require("./gemini-live.session") as typeof import("./gemini-live.session");

// summarize() is what Gemini Live reads back to the shopkeeper. If it drops the
// real figures, Gemini invents numbers (the "520 items, 2 crores" bug). These
// guard that every read keeps its true values.
function summarize(result: unknown): any {
  const session = new GeminiLiveSession({} as any, "shop-1", {} as any, () => {});
  return (session as any).summarize(result);
}

describe("GeminiLiveSession.summarize", () => {
  it("keeps the real stock summary figures (never {ok:true})", () => {
    const out = summarize({
      totalItems: 10,
      byStatus: { available: 7, in_workshop: 1, sold: 2 },
      byPurity: { "22K": 8, "18K": 2 },
      totalEstimatedValue: "1477000"
    });
    expect(out.totalItems).toBe(10);
    expect(out.totalEstimatedValue).toBe("1477000");
    expect(out.byStatus_available).toBe(7);
    expect(out).not.toEqual({ ok: true });
  });

  it("keeps karigar scorecard numbers", () => {
    const out = summarize({
      karigar: { id: "k1", name: "Murugan Aasari", specialization: "chains" },
      totalJobs: 8,
      openJobs: 8,
      totalIssuedWeight: "274.500",
      flaggedReturns: 1
    });
    expect(out.totalJobs).toBe(8);
    expect(out.totalIssuedWeight).toBe("274.500");
    expect(out.karigar_name).toBe("Murugan Aasari");
    expect(out.karigar_id).toBeUndefined(); // ids are not spoken
  });

  it("coerces decimal.js values to their string figure", () => {
    const out = summarize({ itemCount: 3, totalValue: new Decimal("60000"), flagged: 0 });
    expect(out.totalValue).toBe("60000");
    expect(out.itemCount).toBe(3);
  });

  it("collapses arrays to a count instead of dumping rows", () => {
    const out = summarize({ count: 7, stuckValue: "1173000", items: [{}, {}, {}, {}, {}, {}, {}] });
    expect(out.count).toBe(7);
    expect(out.stuckValue).toBe("1173000");
    expect(out.itemsCount).toBe(7);
  });

  it("surfaces write identifiers for an issued job", () => {
    const out = summarize({ id: "j1", jobNumber: "KJ-ABC", issuedWeight: "40", purity: "22K" });
    expect(out).toEqual({ jobNumber: "KJ-ABC", issuedWeight: "40" });
  });

  it("returns ok for a non-object result", () => {
    expect(summarize(null)).toEqual({ ok: true });
  });
});
