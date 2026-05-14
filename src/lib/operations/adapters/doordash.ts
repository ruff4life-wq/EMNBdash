import type { PlatformAdapter } from "../types";

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ");

const scoreHeaderCoverage = (headers: string[], expected: string[]) => {
  const normalized = headers.map(normalizeHeader);
  const matched = expected.filter((candidate) =>
    normalized.some((header) => header === normalizeHeader(candidate)),
  ).length;
  return expected.length ? matched / expected.length : 0;
};

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
