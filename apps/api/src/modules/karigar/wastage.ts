import Decimal from "decimal.js";

export function calculateKarigarWastage(issuedWeight: string | Decimal.Value, finishedWeight: string | Decimal.Value, scrapWeight: string | Decimal.Value) {
  const issued = new Decimal(issuedWeight);
  const finished = new Decimal(finishedWeight);
  const scrap = new Decimal(scrapWeight);
  if (issued.lte(0)) throw new Error("Issued weight must be positive");
  if (finished.plus(scrap).gt(issued)) throw new Error("Returned weight exceeds issued weight");
  const wastageWeight = issued.minus(finished).minus(scrap);
  const wastagePercent = wastageWeight.div(issued).mul(100);
  return {
    wastageWeight,
    wastagePercent,
    flagged: wastagePercent.gt(3)
  };
}
