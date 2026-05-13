export type DataQuality = "ok" | "missing_revenue" | "missing_customer" | "flagged" | "fee_adjustment_row";
export type MappingMode = "auto" | "manual";
export type CustomerTier = "vip" | "loyal" | "promo_heavy" | "new" | "at_risk" | "unassigned";

export type CanonicalField =
  | "orderDate"
  | "customerName"
  | "menuItem"
  | "quantitySold"
  | "grossRevenue"
  | "doorDashFees"
  | "marketingFees"
  | "customerDiscounts"
  | "netPayoutPerItem"
  | "netPayoutPerOrder"
  | "marketingCredits"
  | "netNetPayout";

export interface SkipRule {
  type: "customer_match" | "all_blank" | "blank_row";
  pattern?: RegExp;
  fields?: CanonicalField[];
}

export interface PlatformAdapter {
  id: string;
  displayName: string;
  detectConfidence: (headers: string[]) => number;
  columnMap: Record<string, CanonicalField>;
  dateFormat: "excel_serial" | "MM/DD/YYYY" | "ISO" | "auto";
  feeColumns: CanonicalField[];
  skipRowRules: SkipRule[];
}

export interface RawSheet {
  name: string;
  rows: unknown[][];
  headerRowIndex: number;
  headers: string[];
  classificationScore: number;
  type: "operational_data" | "menu_reference" | "summary_dashboard" | "order_history" | "unknown";
}

export interface MappingAudit {
  canonicalField: CanonicalField;
  detectedColumn: string;
  confidence: number;
  mode: MappingMode;
}

export interface LineItem {
  id: string;
  orderId: string;
  sourceSheet: string;
  sourcePlatform: string;
  importTimestamp: string;
  orderDate: string;
  weekLabel: string;
  customerName: string;
  menuItem: string;
  quantitySold: number;
  grossRevenue: number;
  doorDashFees: number;
  marketingFees: number;
  customerDiscounts: number;
  netPayoutPerItem: number;
  marketingCredits: number;
  netNetPayout: number;
  dataQuality: DataQuality;
}

export interface Order {
  orderId: string;
  orderDate: string;
  weekLabel: string;
  customerName: string;
  sourcePlatform: string;
  importTimestamp: string;
  lineItems: LineItem[];
  totalGrossRevenue: number;
  totalDoorDashFees: number;
  totalMarketingFees: number;
  totalDiscounts: number;
  totalNetNetPayout: number;
  totalMarketingCredits: number;
  totalItemCount: number;
  feePercent: number;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  isActive: boolean;
  platforms: string[];
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerProfile {
  id: string;
  displayName: string;
  aliases: string[];
  tier: CustomerTier;
  tierOverride: boolean;
  notes: string;
  tags: string[];
  firstSeen: string;
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportRecord {
  id: string;
  filename: string;
  importTimestamp: string;
  platform: string;
  sheetsDetected: number;
  sheetsProcessed: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsFlagged: number;
  duplicatesResolved: number;
  mappingMode: MappingMode;
  columnMappings: Record<string, string>;
}

export interface OperatorSettings {
  vipSpendPercentile: number;
  vipMinOrderCount: number;
  promoHeavyDiscountThreshold: number;
  atRiskInactivityWindowDays: number;
  priceVarianceAlertThreshold: number;
  feeBurdenAlertThreshold: number;
  defaultDateRange: "all" | "last30" | "last7" | "current_week";
  currencySymbol: string;
  timezone: string;
}

export interface FilterState {
  startDate: string;
  endDate: string;
  weekLabels: string[];
  platforms: string[];
  customers: string[];
  menuItems: string[];
  tiers: CustomerTier[];
  feeBurdenThreshold: number;
}

export interface IngestionEvent {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface IngestionResult {
  lineItems: LineItem[];
  orders: Order[];
  importRecord: ImportRecord;
  customers: CustomerProfile[];
  mappingAudit: MappingAudit[];
  logs: IngestionEvent[];
  newMenuItemNames: string[];
}
