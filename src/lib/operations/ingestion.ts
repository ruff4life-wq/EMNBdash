import * as XLSX from "xlsx";
import { canonicalFieldHints, detectPlatformAdapter } from "./adapters";
import type {
  CanonicalField,
  CustomerProfile,
  IngestionEvent,
  IngestionResult,
  LineItem,
  MappingAudit,
  MappingMode,
  MenuItem,
  OperatorSettings,
  PlatformAdapter,
  RawSheet,
} from "./types";

const headerTokens = ["date", "customer", "item", "revenue", "payout", "fee", "quantity"];
const requiredFields: CanonicalField[] = ["orderDate", "customerName", "menuItem", "quantitySold", "grossRevenue"];
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
const toNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = clean(value).replace(/[$,%(),]/g, (match) => (match === "(" || match === ")" ? "-" : ""));
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const excelSerialToDate = (serial: number): Date =>
  new Date(Math.round((serial - 25569) * 86400 * 1000));

const parseDate = (value: unknown, adapter: PlatformAdapter, logs: IngestionEvent[]) => {
  // SheetJS with cellDates:true returns pre-parsed Date objects for .xlsm files
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // JS timestamps (ms since epoch) are > 1e11; Excel serials are < 1e6
    if (value > 1e11) {
      const converted = new Date(value);
      log(logs, "info", `Date JS-timestamp converted: ${value} -> ${converted.toISOString().slice(0, 10)}`);
      return converted;
    }
    const converted = excelSerialToDate(value);
    log(logs, "info", `Date serial converted: ${value} -> ${converted.toISOString().slice(0, 10)}`);
    return converted;
  }
  const raw = clean(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    log(logs, "warn", `Unable to parse date value "${raw}" with adapter ${adapter.id}`);
    return null;
  }
  return parsed;
};

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

const levenshtein = (a: string, b: string) => {
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

const mapColumns = (headers: string[], adapter: PlatformAdapter): { indexes: Partial<Record<CanonicalField, number>>; audit: MappingAudit[]; mode: MappingMode } => {
  const indexes: Partial<Record<CanonicalField, number>> = {};
  const audit: MappingAudit[] = [];
  const normalizedAdapterMap = new Map(
    Object.entries(adapter.columnMap).map(([source, field]) => [normalizeKey(source), field]),
  );

  headers.forEach((header, index) => {
    const field = normalizedAdapterMap.get(normalizeKey(header));
    if (field && indexes[field] === undefined) {
      indexes[field] = index;
      audit.push({ canonicalField: field, detectedColumn: header, confidence: 1, mode: "auto" });
    }
  });

  for (const [field, hints] of Object.entries(canonicalFieldHints) as [CanonicalField, string[]][]) {
    if (indexes[field] !== undefined) continue;
    const candidates = headers.map((header, index) => {
      const normalizedHeader = normalizeKey(header);
      const score = Math.max(
        ...hints.map((hint) => {
          const normalizedHint = normalizeKey(hint);
          if (normalizedHeader.includes(normalizedHint) || normalizedHint.includes(normalizedHeader)) return 0.9;
          const distance = levenshtein(normalizedHeader, normalizedHint);
          return Math.max(0, 1 - distance / Math.max(normalizedHeader.length, normalizedHint.length, 1));
        }),
      );
      return { header, index, score };
    }).sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best && best.score >= 0.55) {
      indexes[field] = best.index;
      audit.push({ canonicalField: field, detectedColumn: best.header, confidence: best.score, mode: best.score >= 0.75 ? "auto" : "manual" });
    }
  }

  const requiresManual = requiredFields.some((field) => {
    const entry = audit.find((item) => item.canonicalField === field);
    return !entry || entry.confidence < 0.75;
  });
  console.info("Column mapping results", audit);
  return { indexes, audit, mode: requiresManual ? "manual" : "auto" };
};

const toTitleCase = (str: string) =>
  str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

const isBlankRow = (row: unknown[]) => row.every((cell) => clean(cell) === "");

const buildWeekLabel = (sheetName: string, orderDate: Date) => {
  const trimmed = sheetName.trim();
  if (trimmed) return trimmed;
  return orderDate.toISOString().slice(0, 10);
};

const findCustomerAlias = (rawName: string, customers: CustomerProfile[]) => {
  const normalized = normalizeKey(rawName);
  return customers.find((customer) =>
    [customer.displayName, ...customer.aliases].some((name) => normalizeKey(name) === normalized),
  )?.displayName ?? rawName;
};

const findMenuMatch = (rawName: string, menuItems: MenuItem[]) => {
  const normalized = normalizeKey(rawName);
  return menuItems.find((item) =>
    [item.name, ...item.aliases].some((name) => normalizeKey(name) === normalized),
  );
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

const autoTierCustomers = (customers: CustomerProfile[], orders: ReturnType<typeof rebuildOrders>, settings: OperatorSettings) => {
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

export async function ingestFile(params: {
  file: File;
  existingLineItems: LineItem[];
  existingCustomers: CustomerProfile[];
  menuItems: MenuItem[];
  settings: OperatorSettings;
}): Promise<IngestionResult> {
  const logs: IngestionEvent[] = [];
  const importTimestamp = new Date().toISOString();
  const rawSheets = await parseWorkbookFile(params.file, logs);
  const operationalSheets = rawSheets.filter((sheet) => sheet.type === "operational_data");
  const allHeaders = operationalSheets.flatMap((sheet) => sheet.headers);
  const { adapter, confidence } = detectPlatformAdapter(allHeaders);
  log(logs, "info", `Adapter selected: ${adapter.id} (${confidence.toFixed(2)})`);

  const staging: LineItem[] = [];
  const mappingAudit: MappingAudit[] = [];
  let rowsSkipped = 0;
  let rowsFlagged = 0;
  let mappingMode: MappingMode = "auto";

  for (const sheet of operationalSheets) {
    const { indexes, audit, mode } = mapColumns(sheet.headers, adapter);
    mappingAudit.push(...audit);
    if (mode === "manual") mappingMode = "manual";
    log(logs, mode === "manual" ? "warn" : "info", `Mapping mode for ${sheet.name}: ${mode}`);
    let currentCustomer = "";
    let currentDate = "";
    let orderSequence = 0;

    for (let rowIndex = sheet.headerRowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const row = sheet.rows[rowIndex];
      if (isBlankRow(row)) continue;
      const get = (field: CanonicalField) => {
        const index = indexes[field];
        return index === undefined ? "" : row[index];
      };
      const rawCustomer = clean(get("customerName"));
      const rawDate = get("orderDate");
      const rawItem = clean(get("menuItem"));
      const quantity = toNumber(get("quantitySold"));
      const provisionalCustomer = rawCustomer || currentCustomer;

      if (/weekly totals/i.test(provisionalCustomer)) {
        rowsSkipped += 1;
        log(logs, "info", `Skipped row ${rowIndex + 1}: weekly totals`);
        continue;
      }
      if (!clean(rawDate) && !rawCustomer && !rawItem && quantity === 0) {
        rowsSkipped += 1;
        log(logs, "info", `Skipped row ${rowIndex + 1}: annotation or blank operational fields`);
        continue;
      }

      const parsedDate = parseDate(rawDate, adapter, logs);
      if (rawCustomer && parsedDate) {
        currentCustomer = toTitleCase(rawCustomer);
        const nextDate = parsedDate.toISOString().slice(0, 10);
        if (nextDate !== currentDate || rawCustomer !== provisionalCustomer) orderSequence += 1;
        currentDate = nextDate;
      } else if (!rawCustomer && currentCustomer) {
        log(logs, "info", `Forward-filled customer "${currentCustomer}" into row ${rowIndex + 1}`);
      }

      const customerName = findCustomerAlias(currentCustomer || toTitleCase(rawCustomer), params.existingCustomers);
      const orderDate = parsedDate ?? (currentDate ? new Date(currentDate) : null);
      const grossRevenue = toNumber(get("grossRevenue"));
      const netNetPayoutVal = toNumber(get("netNetPayout"));

      // Platform fee adjustment rows: zero revenue, nonzero payout, blank item — not real transactions
      if (grossRevenue === 0 && netNetPayoutVal !== 0 && !rawItem) {
        rowsSkipped += 1;
        log(logs, "info", `Skipped row ${rowIndex + 1}: fee_adjustment_row (grossRevenue=0, netPayout=${netNetPayoutVal}, blank item)`);
        continue;
      }

      const menuMatch = findMenuMatch(rawItem, params.menuItems);
      const dataQuality = !customerName ? "missing_customer" : grossRevenue === 0 ? "missing_revenue" : "ok";
      if (dataQuality !== "ok") rowsFlagged += 1;
      if (menuMatch && quantity > 0) {
        const chargedPrice = grossRevenue / quantity;
        const variance = menuMatch.price ? Math.abs(chargedPrice - menuMatch.price) / menuMatch.price : 0;
        if (variance > params.settings.priceVarianceAlertThreshold / 100) rowsFlagged += 1;
      }
      if (!orderDate || !rawItem) {
        rowsSkipped += 1;
        log(logs, "warn", `Skipped row ${rowIndex + 1}: missing required transaction fields`);
        continue;
      }

      const orderId = `${adapter.id}-${orderDate.toISOString().slice(0, 10)}-${normalizeKey(customerName)}-${orderSequence}`;
      staging.push({
        id: makeId(),
        orderId,
        sourceSheet: sheet.name,
        sourcePlatform: adapter.id,
        importTimestamp,
        orderDate: orderDate.toISOString(),
        weekLabel: buildWeekLabel(sheet.name, orderDate),
        customerName,
        menuItem: rawItem.toUpperCase(),
        quantitySold: quantity,
        grossRevenue,
        doorDashFees: toNumber(get("doorDashFees")),
        marketingFees: toNumber(get("marketingFees")),
        customerDiscounts: toNumber(get("customerDiscounts")),
        netPayoutPerItem: toNumber(get("netPayoutPerItem")),
        marketingCredits: toNumber(get("marketingCredits")),
        netNetPayout: toNumber(get("netNetPayout")),
        dataQuality,
      });
    }
  }

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
  const lineItems = [...params.existingLineItems, ...fresh];
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

  return {
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
      platform: adapter.id,
      sheetsDetected: rawSheets.length,
      sheetsProcessed: operationalSheets.length,
      rowsImported: fresh.length,
      rowsSkipped,
      rowsFlagged,
      duplicatesResolved,
      mappingMode,
      columnMappings: Object.fromEntries(mappingAudit.map((entry) => [entry.canonicalField, entry.detectedColumn])),
    },
  };
}
