import * as XLSX from "xlsx";
import { runAdapterRegistry } from "./adapters";
import { excelSerialToDate } from "./extractLineItems";
import { distributeOrderFeesAcrossLineItems } from "./normalization";
import type { AppField, MappingRegistry } from "./adapters";
import type {
  CustomerProfile,
  IngestionEvent,
  IngestionResult,
  LineItem,
  MenuItem,
  OperatorSettings,
  RawSheet,
} from "./types";

const headerTokens = ["date", "customer", "item", "revenue", "payout", "fee", "quantity"];
const makeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const log = (logs: IngestionEvent[], level: IngestionEvent["level"], message: string) => {
  const event = { id: makeId(), timestamp: new Date().toISOString(), level, message };
  logs.push(event);
  const payload = `[operations:${level}] ${message}`;
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
};

const clean = (value: unknown) => String(value ?? "").trim();
const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

export { excelSerialToDate };

const findHeaderRow = (rows: unknown[][], logs: IngestionEvent[]) => {
  const scanLimit = Math.min(rows.length, 20);
  for (let index = 0; index < scanLimit; index += 1) {
    const rowTokens = rows[index].map((cell) => clean(cell).toLowerCase());
    const matches = headerTokens.filter((token) => rowTokens.some((cell) => cell.includes(token)));
    if (matches.length >= 4) {
      log(logs, "info", `Header row detected at index ${index}; tokens: ${matches.join(", ")}`);
      return index;
    }
  }
  log(logs, "warn", "No confident header row found in first scanned rows");
  return -1;
};

const classifySheet = (name: string, rows: unknown[][], headerRowIndex: number): RawSheet => {
  const headers = headerRowIndex >= 0 ? rows[headerRowIndex].map(clean) : [];
  const normalized = headers.map((header) => header.toLowerCase());
  let score = 0;
  if (normalized.some((header) => header.includes("date"))) score += 2;
  if (normalized.some((header) => header.includes("payout"))) score += 2;
  if (normalized.some((header) => header.includes("customer"))) score += 2;
  if (normalized.some((header) => header.includes("fee"))) score += 1;
  if (normalized.some((header) => header.includes("quantity") || header === "qty")) score += 1;
  if (/week/i.test(name)) score += 1;
  if (rows.length - headerRowIndex > 5) score += 1;
  const type = score >= 5 ? "operational_data" : "unknown";
  console.info("Sheet classification", { sheet: name, score, type });
  return { name, rows, headerRowIndex, headers, classificationScore: score, type };
};

const rebuildOrders = (lineItems: LineItem[]) =>
  Array.from(
    lineItems.reduce((map, item) => {
      const current = map.get(item.orderId) ?? [];
      current.push(item);
      map.set(item.orderId, current);
      return map;
    }, new Map<string, LineItem[]>()),
  ).map(([orderId, items]) => {
    const gross = items.reduce((sum, item) => sum + item.grossRevenue, 0);
    const platformFees = items.reduce((sum, item) => sum + item.doorDashFees, 0);
    const marketingFees = items.reduce((sum, item) => sum + item.marketingFees, 0);
    return {
      orderId,
      orderDate: items[0].orderDate,
      weekLabel: items[0].weekLabel,
      customerName: items[0].customerName,
      sourcePlatform: items[0].sourcePlatform,
      importTimestamp: items[0].importTimestamp,
      lineItems: items,
      totalGrossRevenue: gross,
      totalDoorDashFees: platformFees,
      totalMarketingFees: marketingFees,
      totalDiscounts: items.reduce((sum, item) => sum + item.customerDiscounts, 0),
      totalNetNetPayout: items.reduce((sum, item) => sum + item.netNetPayout, 0),
      totalMarketingCredits: items.reduce((sum, item) => sum + item.marketingCredits, 0),
      totalItemCount: items.reduce((sum, item) => sum + item.quantitySold, 0),
      feePercent: gross ? ((platformFees + marketingFees) / gross) * 100 : 0,
    };
  });

const autoTierCustomers = (
  customers: CustomerProfile[],
  orders: ReturnType<typeof rebuildOrders>,
  settings: OperatorSettings,
) => {
  const spendByCustomer = new Map<string, { spend: number; count: number; discount: number; first: string; last: string }>();
  orders.forEach((order) => {
    const current = spendByCustomer.get(order.customerName) ?? {
      spend: 0,
      count: 0,
      discount: 0,
      first: order.orderDate,
      last: order.orderDate,
    };
    current.spend += order.totalGrossRevenue;
    current.count += 1;
    current.discount += order.totalDiscounts;
    current.first = order.orderDate < current.first ? order.orderDate : current.first;
    current.last = order.orderDate > current.last ? order.orderDate : current.last;
    spendByCustomer.set(order.customerName, current);
  });
  const spends = Array.from(spendByCustomer.values()).map((value) => value.spend).sort((a, b) => a - b);
  const percentileIndex = Math.max(0, Math.ceil((settings.vipSpendPercentile / 100) * spends.length) - 1);
  const vipSpendFloor = spends[percentileIndex] ?? Number.POSITIVE_INFINITY;
  return customers.map((customer) => {
    const metrics = spendByCustomer.get(customer.displayName);
    if (!metrics) return customer;
    if (customer.tierOverride) return { ...customer, firstSeen: metrics.first, lastSeen: metrics.last };
    const discountRate = metrics.spend ? (metrics.discount / metrics.spend) * 100 : 0;
    let tier = customer.tier;
    if (metrics.spend >= vipSpendFloor && metrics.count >= settings.vipMinOrderCount) tier = "vip";
    else if (discountRate > settings.promoHeavyDiscountThreshold) tier = "promo_heavy";
    else if (metrics.count >= 2) tier = "loyal";
    else if (metrics.count === 1) tier = "new";
    else tier = "unassigned";
    console.info("Tier assignment", { customer: customer.displayName, tier });
    return { ...customer, tier, firstSeen: metrics.first, lastSeen: metrics.last, updatedAt: new Date().toISOString() };
  });
};

export const parseWorkbookFile = async (file: File, logs: IngestionEvent[]) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  log(logs, "info", `Workbook parsed: ${file.name}; sheets: ${workbook.SheetNames.length}`);
  return workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: true, defval: "" });
    const headerRowIndex = findHeaderRow(rows, logs);
    return classifySheet(name, rows, headerRowIndex);
  });
};

export type IngestFileOutcome =
  | {
      status: "complete";
      result: IngestionResult;
      confidence: number;
      adapterUsed: string;
    }
  | {
      status: "needs_mapping";
      detectedColumns: string[];
      bestGuess: Record<AppField, string>;
      fingerprint: string;
      rawSheets: RawSheet[];
    }
  | { status: "error"; message: string };

export async function ingestFile(params: {
  file: File;
  existingLineItems: LineItem[];
  existingCustomers: CustomerProfile[];
  menuItems: MenuItem[];
  settings: OperatorSettings;
  mappingRegistry: MappingRegistry;
  manualColumnMapping?: Partial<Record<AppField, string>> | null;
}): Promise<IngestFileOutcome> {
  const logs: IngestionEvent[] = [];
  const importTimestamp = new Date().toISOString();
  const rawSheets = await parseWorkbookFile(params.file, logs);

  const adapterResult = runAdapterRegistry(
    params.file.name,
    rawSheets,
    params.mappingRegistry,
    {
      existingCustomers: params.existingCustomers,
      menuItems: params.menuItems,
      settings: params.settings,
      importTimestamp,
      logs,
    },
    params.manualColumnMapping ?? null,
  );

  if (adapterResult.status === "error") {
    return { status: "error", message: adapterResult.message };
  }
  if (adapterResult.status === "needs_mapping") {
    return {
      status: "needs_mapping",
      detectedColumns: adapterResult.detectedColumns,
      bestGuess: adapterResult.bestGuess,
      fingerprint: adapterResult.fingerprint,
      rawSheets,
    };
  }

  const { data, confidence, adapterUsed } = adapterResult;
  log(logs, "info", `Adapter pipeline: ${adapterUsed} (confidence ${confidence})`);

  const staging = data.lineItems;
  const mappingAudit = data.mappingAudit;
  const rowsSkipped = data.rowsSkipped;
  const rowsFlagged = data.rowsFlagged;
  const mappingMode = data.mappingMode;

  const existingKeys = new Set(
    params.existingLineItems.map((item) =>
      [item.orderDate.slice(0, 10), normalizeKey(item.customerName), normalizeKey(item.menuItem), item.quantitySold].join("|"),
    ),
  );
  let duplicatesResolved = 0;
  const fresh = staging.filter((item) => {
    const key = [item.orderDate.slice(0, 10), normalizeKey(item.customerName), normalizeKey(item.menuItem), item.quantitySold].join("|");
    if (existingKeys.has(key)) {
      duplicatesResolved += 1;
      log(logs, "info", `Duplicate resolved for ${key}`);
      return false;
    }
    existingKeys.add(key);
    return true;
  });
  const lineItems = distributeOrderFeesAcrossLineItems([...params.existingLineItems, ...fresh]);
  const orders = rebuildOrders(lineItems);
  const customerMap = new Map(params.existingCustomers.map((customer) => [normalizeKey(customer.displayName), customer]));
  orders.forEach((order) => {
    const key = normalizeKey(order.customerName);
    if (!customerMap.has(key)) {
      log(logs, "info", `Auto-discovered customer: ${order.customerName}`);
      customerMap.set(key, {
        id: makeId(),
        displayName: order.customerName,
        aliases: [],
        tier: "unassigned",
        tierOverride: false,
        notes: "",
        tags: [],
        firstSeen: order.orderDate,
        lastSeen: order.orderDate,
        createdAt: importTimestamp,
        updatedAt: importTimestamp,
      });
    }
  });
  const customers = autoTierCustomers(Array.from(customerMap.values()), orders, params.settings);
  const menuNames = new Set(params.menuItems.flatMap((item) => [item.name, ...item.aliases].map(normalizeKey)));
  const newMenuItemNames = Array.from(new Set(fresh.map((item) => item.menuItem))).filter((name) => !menuNames.has(normalizeKey(name)));
  newMenuItemNames.forEach((name) => log(logs, "info", `Auto-discovered menu item candidate: ${name}`));

  const operationalSheets = rawSheets.filter((sheet) => sheet.type === "operational_data");

  return {
    status: "complete",
    confidence,
    adapterUsed,
    result: {
      lineItems,
      orders,
      customers,
      mappingAudit,
      logs,
      newMenuItemNames,
      importRecord: {
        id: makeId(),
        filename: params.file.name,
        importTimestamp,
        platform: data.platform,
        sheetsDetected: rawSheets.length,
        sheetsProcessed: operationalSheets.length,
        rowsImported: fresh.length,
        rowsSkipped,
        rowsFlagged,
        duplicatesResolved,
        mappingMode,
        columnMappings: Object.fromEntries(mappingAudit.map((entry) => [entry.canonicalField, entry.detectedColumn])),
        adapterConfidence: confidence,
        adapterUsed,
      },
    },
  };
}
