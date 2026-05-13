import type { CanonicalField, PlatformAdapter } from "./types";

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ");

const scoreHeaderCoverage = (headers: string[], expected: string[]) => {
  const normalized = headers.map(normalizeHeader);
  const matched = expected.filter((candidate) =>
    normalized.some((header) => header === normalizeHeader(candidate)),
  ).length;
  return expected.length ? matched / expected.length : 0;
};

const canonicalHints: Record<CanonicalField, string[]> = {
  orderDate: ["date", "order date", "created date"],
  customerName: ["customer", "customer name", "guest", "name"],
  menuItem: ["menu item", "item", "item name", "product"],
  quantitySold: ["quantity sold", "quantity", "qty", "count"],
  grossRevenue: ["gross revenue", "subtotal", "sales", "revenue"],
  doorDashFees: ["door dash fees", "doordash fees", "platform fees", "fees"],
  marketingFees: ["marketing fees", "ad fees", "promotion fees"],
  customerDiscounts: ["customer discounts", "discounts", "promo discount"],
  netPayoutPerItem: ["net payout per item", "net payout", "item payout"],
  netPayoutPerOrder: ["net payout per order", "order payout"],
  marketingCredits: ["marketing credits", "marketing credit", "credits"],
  netNetPayout: ["net net payout", "final payout", "payout"],
};

const buildGenericMap = () =>
  Object.fromEntries(
    Object.entries(canonicalHints).flatMap(([field, hints]) =>
      hints.map((hint) => [hint, field as CanonicalField]),
    ),
  );

export const DoorDashAdapter: PlatformAdapter = {
  id: "doordash",
  displayName: "DoorDash",
  dateFormat: "excel_serial",
  columnMap: {
    DATE: "orderDate",
    Date: "orderDate",
    CUSTOMER: "customerName",
    Customer: "customerName",
    "MENU ITEM": "menuItem",
    "Menu Item": "menuItem",
    "QUANTITY SOLD": "quantitySold",
    "Quantity Sold": "quantitySold",
    "GROSS REVENUE": "grossRevenue",
    "Gross Revenue": "grossRevenue",
    "DOOR DASH FEES": "doorDashFees",
    "DoorDash Fees": "doorDashFees",
    "DoorDash Fee": "doorDashFees",
    "MARKETING FEES": "marketingFees",
    "Marketing Fees": "marketingFees",
    "CUSTOMER DISCOUNTS": "customerDiscounts",
    "Customer Discounts": "customerDiscounts",
    "NET PAYOUT PER ITEM": "netPayoutPerItem",
    "Net Payout": "netPayoutPerItem",
    "NET PAYOUT PER ORDER": "netPayoutPerOrder",
    "MARKETING CREDITS": "marketingCredits",
    "Marketing Credit": "marketingCredits",
    "Marketing Credits": "marketingCredits",
    "NET NET PAYOUT": "netNetPayout",
    "Net Net Payout": "netNetPayout",
  },
  feeColumns: ["doorDashFees", "marketingFees"],
  skipRowRules: [
    { type: "customer_match", pattern: /weekly totals/i },
    { type: "all_blank", fields: ["orderDate", "customerName", "menuItem", "quantitySold"] },
    { type: "blank_row" },
  ],
  detectConfidence: (headers) =>
    Math.min(
      1,
      scoreHeaderCoverage(headers, [
        "DATE",
        "CUSTOMER",
        "MENU ITEM",
        "QUANTITY SOLD",
        "GROSS REVENUE",
        "NET NET PAYOUT",
      ]),
    ),
};

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
    const normalized = headers.map(normalizeHeader);
    const matchedRequired = ["date", "customer", "item", "quantity"].filter((token) =>
      normalized.some((header) => header.includes(token)),
    ).length;
    return matchedRequired / 4;
  },
};

export const platformAdapters = [DoorDashAdapter, GenericAdapter];

export const detectPlatformAdapter = (headers: string[]) => {
  const scored = platformAdapters
    .map((adapter) => ({ adapter, confidence: adapter.detectConfidence(headers) }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = scored[0] ?? { adapter: GenericAdapter, confidence: 0 };
  const selected = best.confidence > 0.6 ? best : { adapter: GenericAdapter, confidence: GenericAdapter.detectConfidence(headers) };
  console.info("Adapter selection", {
    selected: selected.adapter.id,
    confidence: selected.confidence,
    scores: scored.map((entry) => ({ id: entry.adapter.id, confidence: entry.confidence })),
  });
  return selected;
};

export const registeredPlatformConfigs = platformAdapters.map((adapter) => ({
  id: adapter.id,
  displayName: adapter.displayName,
}));

export const canonicalFieldHints = canonicalHints;
