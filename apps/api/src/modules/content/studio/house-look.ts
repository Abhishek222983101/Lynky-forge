// Section 0.4 + 3.1 + 4 - house look and 95/5 content lane selection.

import { ContentLane, HouseLook } from "./types";

/** Section 3.1 / 0.4 - choose one of the three house looks. */
export function pickHouseLook(text: string, category?: string | null): HouseLook {
  const t = `${text} ${category ?? ""}`.toLowerCase();
  if (/temple|antique|bridal|kundan|coin|festival|festive|wedding/.test(t)) return "heritage-opulence";
  if (/diamond|gemstone|statement|product|hero|ruby|emerald|sapphire/.test(t)) return "jewel-tone-drama";
  if (/daily|minimal|office|modern|solitaire/.test(t)) return "modern-serenity";
  return "heritage-opulence";
}

/** Section 4 - 95 percent on-model female is the default; 5 percent otherwise. */
export function pickLane(text: string, category?: string | null): ContentLane {
  const t = `${text} ${category ?? ""}`.toLowerCase();
  if (/product.?only|flat.?lay|packaging|catalogue|catalog|process|macro|men'?s|male|kid|child/.test(t)) {
    return "other-5";
  }
  return "female-95";
}
