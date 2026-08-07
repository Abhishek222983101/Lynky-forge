import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function decimal(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function money(value: Decimal.Value): Decimal {
  return decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
