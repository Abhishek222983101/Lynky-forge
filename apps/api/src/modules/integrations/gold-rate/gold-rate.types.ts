import Decimal from "decimal.js";

export type GoldRateResponse = {
  purity: string;
  ratePerGram: Decimal;
  source: string;
  fetchedAt: Date;
};
