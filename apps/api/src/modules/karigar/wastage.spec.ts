import { calculateKarigarWastage } from "./wastage";

describe("calculateKarigarWastage", () => {
  it("calculates gold wastage from issued, finished and scrap weights", () => {
    const result = calculateKarigarWastage("50", "48", "1.5");

    expect(result.wastageWeight.toString()).toBe("0.5");
    expect(result.wastagePercent.toString()).toBe("1");
    expect(result.flagged).toBe(false);
  });

  it("flags high wastage over three percent", () => {
    const result = calculateKarigarWastage("50", "46", "1");

    expect(result.wastageWeight.toString()).toBe("3");
    expect(result.wastagePercent.toString()).toBe("6");
    expect(result.flagged).toBe(true);
  });
});
