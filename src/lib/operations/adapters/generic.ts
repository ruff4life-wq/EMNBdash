import type { CanonicalField, MappingAudit, MappingMode, PlatformAdapter } from "../types";

/** Collapse whitespace; lowercase; unify separators (aligned with ingestion normalizeKey). */
export const normalizeColumnHeaderForMatch = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

export const levenshtein = (a: string, b: string) => {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
};

/** Expanded synonym lists: date, customer, menu item, qty, gross, net, fee families. */
export const canonicalFieldHints: Record<CanonicalField, string[]> = {
  orderDate: [
    "date",
    "order date",
    "orderdate",
    "transaction date",
    "trans date",
    "created date",
    "created",
    "day",
    "business date",
    "delivery date",
    "service date",
  ],
  customerName: [
    "customer",
    "customer name",
    "guest",
    "client",
    "account",
    "buyer",
    "party",
    "name",
    "merchant",
  ],
  menuItem: [
    "menu item",
    "item",
    "item name",
    "product",
    "sku",
    "description",
    "menu",
    "dish",
    "line item",
    "article",
  ],
  quantitySold: ["quantity sold", "quantity", "qty", "count", "units", "pcs", "# sold", "qty sold"],
  grossRevenue: [
    "gross revenue",
    "subtotal",
    "sales",
    "revenue",
    "gross sales",
    "item total",
    "extended price",
    "amount",
    "total sales",
  ],
  doorDashFees: [
    "door dash fees",
    "doordash fees",
    "platform fees",
    "platform fee",
    "fees",
    "service fee",
    "commission",
    "delivery fee",
    "dd fee",
  ],
  marketingFees: [
    "marketing fees",
    "ad fees",
    "promotion fees",
    "marketing fee",
    "promo fee",
    "ads",
    "sponsored",
  ],
  customerDiscounts: ["customer discounts", "discounts", "promo discount", "discount", "promotions"],
  netPayoutPerItem: ["net payout per item", "net payout", "item payout", "payout per item"],
  netPayoutPerOrder: ["net payout per order", "order payout"],
  marketingCredits: ["marketing credits", "marketing credit", "credits", "credit"],
  netNetPayout: ["net net payout", "final payout", "payout", "net payout total", "net to you", "deposit"],
};

const buildGenericMap = () =>
  Object.fromEntries(
    Object.entries(canonicalFieldHints).flatMap(([field, hints]) =>
      hints.map((hint) => [hint, field as CanonicalField]),
    ),
  );

export const GenericAdapter: PlatformAdapter = {
  id: "generic",
  displayName: "Generic Spreadsheet",
  dateFormat: "auto",
  columnMap: buildGenericMap(),
  feeColumns: ["doorDashFees", "marketingFees"],
  skipRowRules: [
    { type: "all_blank", fields: ["orderDate", "customerName", "menuItem", "quantitySold"] },
    { type: "blank_row" },
  ],
  detectConfidence: (headers) => {
    const normalized = headers.map(normalizeColumnHeaderForMatch);
    const matchedRequired = ["date", "customer", "item", "quantity"].filter((token) =>
      normalized.some((header) => header.includes(token)),
    ).length;
    return matchedRequired / 4;
  },
};

const requiredFields: CanonicalField[] = ["orderDate", "customerName", "menuItem", "quantitySold", "grossRevenue"];

type MatchTier = "exact" | "starts" | "contains" | "lev";

const scoreHeaderAgainstHint = (headerNorm: string, hintNorm: string): { score: number; tier: MatchTier } | null => {
  if (headerNorm === hintNorm) return { score: 100, tier: "exact" };
  if (headerNorm.startsWith(hintNorm) || hintNorm.startsWith(headerNorm)) return { score: 88, tier: "starts" };
  if (headerNorm.includes(hintNorm) || hintNorm.includes(headerNorm)) return { score: 72, tier: "contains" };
  const dist = levenshtein(headerNorm, hintNorm);
  if (dist <= 2) return { score: Math.max(40, 58 - dist * 9), tier: "lev" };
  return null;
};

const bestScoreForField = (headerNorm: string, field: CanonicalField) => {
  let best: { score: number; tier: MatchTier } | null = null;
  for (const hint of canonicalFieldHints[field]) {
    const hintNorm = normalizeColumnHeaderForMatch(hint);
    const hit = scoreHeaderAgainstHint(headerNorm, hintNorm);
    if (hit && (!best || hit.score > best.score)) best = hit;
  }
  return best;
};

export type FuzzyColumnMatchResult = {
  indexes: Partial<Record<CanonicalField, number>>;
  confidence: number;
  audit: MappingAudit[];
  bestGuess: Record<CanonicalField, string>;
  mode: MappingMode;
};

/**
 * Fuzzy column resolution: normalized headers; exact → starts-with → contains → Levenshtein ≤2.
 * Confidence 0–100 with deductions per weak tiers / collisions.
 */
export function matchColumnsFuzzy(headers: string[]): FuzzyColumnMatchResult {
  const headerNorms = headers.map((h) => normalizeColumnHeaderForMatch(h));
  const fields = Object.keys(canonicalFieldHints) as CanonicalField[];

  const cellScores: { field: CanonicalField; col: number; score: number; tier: MatchTier }[] = [];
  for (let col = 0; col < headers.length; col += 1) {
    const hn = headerNorms[col];
    if (!hn) continue;
    for (const field of fields) {
      const bs = bestScoreForField(hn, field);
      if (bs) cellScores.push({ field, col, score: bs.score, tier: bs.tier });
    }
  }

  cellScores.sort((a, b) => b.score - a.score);

  const usedCols = new Set<number>();
  const usedFields = new Set<CanonicalField>();
  const indexes: Partial<Record<CanonicalField, number>> = {};
  const audit: MappingAudit[] = [];
  let deductions = 0;

  for (const entry of cellScores) {
    if (usedCols.has(entry.col) || usedFields.has(entry.field)) continue;
    usedCols.add(entry.col);
    usedFields.add(entry.field);
    indexes[entry.field] = entry.col;
    const conf01 = entry.score / 100;
    const mode: MappingMode = entry.score >= 88 ? "auto" : entry.score >= 65 ? "auto" : "manual";
    audit.push({
      canonicalField: entry.field,
      detectedColumn: headers[entry.col],
      confidence: conf01,
      mode,
    });
    if (entry.tier === "lev") deductions += 12;
    else if (entry.tier === "contains") deductions += 5;
    else if (entry.tier === "starts") deductions += 2;
  }

  const bestGuess = {} as Record<CanonicalField, string>;
  for (const f of fields) {
    bestGuess[f] = indexes[f] !== undefined ? headers[indexes[f]!] : "";
  }

  const requiredScores = requiredFields.map((f) => {
    const a = audit.find((x) => x.canonicalField === f);
    return a ? a.confidence * 100 : 0;
  });
  const anyMissing = requiredFields.some((f) => indexes[f] === undefined);
  let confidence = anyMissing
    ? 0
    : Math.round(requiredScores.reduce((s, v) => s + v, 0) / requiredFields.length) - deductions;

  const requiresManual = requiredFields.some((field) => {
    const entry = audit.find((item) => item.canonicalField === field);
    return !entry || entry.confidence < 0.75;
  });
  const mode: MappingMode = requiresManual ? "manual" : "auto";

  if (confidence < 0) confidence = 0;
  if (confidence > 100) confidence = 100;

  return { indexes, confidence, audit, bestGuess, mode };
}
