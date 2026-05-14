import { normalizeColumnHeaderForMatch } from "./adapters/generic";
import type {
  CanonicalField,
  CustomerProfile,
  IngestionEvent,
  LineItem,
  MappingAudit,
  MappingMode,
  MenuItem,
  OperatorSettings,
  PlatformAdapter,
  RawSheet,
} from "./types";

export const excelSerialToDate = (serial: number): Date => new Date(Math.round((serial - 25569) * 86400 * 1000));

const clean = (value: unknown) => String(value ?? "").trim();
const normalizeKey = (value: string) => normalizeColumnHeaderForMatch(value);

const toNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = clean(value).replace(/[$,%(),]/g, (match) => (match === "(" || match === ")" ? "-" : ""));
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

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

const parseDate = (value: unknown, adapter: PlatformAdapter, logs: IngestionEvent[]) => {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
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

const toTitleCase = (str: string) => str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

const isBlankRow = (row: unknown[]) => row.every((cell) => clean(cell) === "");

const buildWeekLabel = (sheetName: string, orderDate: Date) => {
  const trimmed = sheetName.trim();
  if (trimmed) return trimmed;
  return orderDate.toISOString().slice(0, 10);
};

const findCustomerAlias = (rawName: string, customers: CustomerProfile[]) => {
  const normalized = normalizeKey(rawName);
  return (
    customers.find((customer) =>
      [customer.displayName, ...customer.aliases].some((name) => normalizeKey(name) === normalized),
    )?.displayName ?? rawName
  );
};

const findMenuMatch = (rawName: string, menuItems: MenuItem[]) => {
  const normalized = normalizeKey(rawName);
  return menuItems.find((item) => [item.name, ...item.aliases].some((name) => normalizeKey(name) === normalized));
};

export type SheetColumnPlan = {
  indexes: Partial<Record<CanonicalField, number>>;
  audit: MappingAudit[];
  mode: MappingMode;
};

export type ExtractLineItemsParams = {
  operationalSheets: RawSheet[];
  getSheetPlan: (sheet: RawSheet) => SheetColumnPlan;
  adapter: PlatformAdapter;
  existingCustomers: CustomerProfile[];
  menuItems: MenuItem[];
  settings: OperatorSettings;
  importTimestamp: string;
  logs: IngestionEvent[];
};

export type ExtractLineItemsResult = {
  staging: LineItem[];
  mappingAudit: MappingAudit[];
  rowsSkipped: number;
  rowsFlagged: number;
  mappingMode: MappingMode;
};

/**
 * Shared row extraction (DoorDash-style forward-fill, Excel serial dates, skip rules).
 */
export function extractLineItemsFromOperationalSheets(params: ExtractLineItemsParams): ExtractLineItemsResult {
  const { operationalSheets, getSheetPlan, adapter, existingCustomers, menuItems, settings, importTimestamp, logs } =
    params;
  const staging: LineItem[] = [];
  const mappingAudit: MappingAudit[] = [];
  let rowsSkipped = 0;
  let rowsFlagged = 0;
  let mappingMode: MappingMode = "auto";

  for (const sheet of operationalSheets) {
    const { indexes, audit, mode } = getSheetPlan(sheet);
    mappingAudit.push(...audit);
    if (mode === "manual") mappingMode = "manual";

    let currentCustomer = "";
    let currentDate = "";
    let orderSequence = 0;

    const get = (field: CanonicalField, row: unknown[]) => {
      const index = indexes[field];
      return index === undefined ? "" : row[index];
    };

    for (let rowIndex = sheet.headerRowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const row = sheet.rows[rowIndex];
      if (isBlankRow(row)) continue;
      const rawCustomer = clean(get("customerName", row));
      const rawDate = get("orderDate", row);
      const rawItem = clean(get("menuItem", row));
      const quantity = toNumber(get("quantitySold", row));
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

      const totalSubtotalItem =
        /^(total|subtotal)\b/i.test(rawItem) && !String(provisionalCustomer || "").trim();
      if (totalSubtotalItem) {
        rowsSkipped += 1;
        log(logs, "info", `Skipped row ${rowIndex + 1}: total/subtotal row without customer`);
        continue;
      }

      const customerName = findCustomerAlias(currentCustomer || toTitleCase(rawCustomer), existingCustomers);
      const orderDate = parsedDate ?? (currentDate ? new Date(currentDate) : null);
      const grossRevenue = toNumber(get("grossRevenue", row));
      const netNetPayoutVal = toNumber(get("netNetPayout", row));

      if (grossRevenue === 0 && netNetPayoutVal !== 0 && !rawItem) {
        rowsSkipped += 1;
        log(logs, "info", `Skipped row ${rowIndex + 1}: fee_adjustment_row (grossRevenue=0, netPayout=${netNetPayoutVal}, blank item)`);
        continue;
      }

      const menuMatch = findMenuMatch(rawItem, menuItems);
      const dataQuality = !customerName ? "missing_customer" : grossRevenue === 0 ? "missing_revenue" : "ok";
      if (dataQuality !== "ok") rowsFlagged += 1;
      if (menuMatch && quantity > 0) {
        const chargedPrice = grossRevenue / quantity;
        const variance = menuMatch.price ? Math.abs(chargedPrice - menuMatch.price) / menuMatch.price : 0;
        if (variance > settings.priceVarianceAlertThreshold / 100) rowsFlagged += 1;
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
        doorDashFees: toNumber(get("doorDashFees", row)),
        marketingFees: toNumber(get("marketingFees", row)),
        customerDiscounts: toNumber(get("customerDiscounts", row)),
        netPayoutPerItem: toNumber(get("netPayoutPerItem", row)),
        marketingCredits: toNumber(get("marketingCredits", row)),
        netNetPayout: toNumber(get("netNetPayout", row)),
        dataQuality,
      });
    }
  }

  return { staging, mappingAudit, rowsSkipped, rowsFlagged, mappingMode };
}
