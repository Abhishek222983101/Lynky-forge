// Affirmation / negation tokens across the languages a Tamil-Nadu counter hears.
// Matching is phrase-level (any token present), so "yes save it", "haan bhai",
// "seri seri", "no cancel that" are all understood — not just a bare "yes".
const yesWords = [
  "yes", "yeah", "yep", "yup", "ya", "ok", "okay", "okey", "sure", "correct", "right",
  "confirm", "confirmed", "save", "saved", "done", "proceed", "fine", "go", "ahead",
  "please", "ready", "absolutely", "definitely", "course", "perfect", "good",
  // Tamil / Hindi / Telugu / Kannada affirmations the counter actually says
  "seri", "sari", "aama", "ama", "aam", "haan", "haa", "han", "haanji", "hanji", "ji",
  "theek", "thik", "sathiyam", "settu", "podu", "pannu", "pannunga", "aagum", "aagattum",
  "chalega", "chal", "karo", "kardo", "kar", "cheyi", "chey", "sare", "aavunu", "avunu"
];
const noWords = [
  "no", "nope", "nah", "cancel", "cancelled", "discard", "stop", "wrong",
  "dont", "wait", "reject", "skip", "later",
  // Hindi / Tamil / Telugu / Kannada negations
  "nahi", "nahin", "vendam", "venda", "illa", "illai", "thappu", "mistake", "change",
  "beda", "vaddu", "vaddhu", "vodhu", "ruko", "band", "chod", "chhod", "rehne", "kaadu", "ledu"
];

function hasWord(text: string, words: string[]): boolean {
  return words.some((word) => new RegExp(`(^|\\s)${word}(\\s|$)`, "i").test(text));
}

/**
 * Negation wins ties: if the reply contains any "no" cue it is treated as cancel,
 * so an ambiguous "no wait, yes" never silently saves. A reply with neither cue
 * returns "unknown" and the caller re-asks instead of guessing.
 */
export function classifyConfirmation(value: string): "yes" | "no" | "unknown" {
  const normalized = ` ${value.trim().toLowerCase().replace(/['.,!?]/g, " ")} `;
  if (hasWord(normalized, noWords)) return "no";
  if (hasWord(normalized, yesWords)) return "yes";
  return "unknown";
}
