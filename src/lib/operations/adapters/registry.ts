import { DoorDashAdapter } from "./doordash";
import { GenericAdapter, matchColumnsFuzzy, normalizeColumnHeaderForMatch } from "./generic";
import { mapColumnsWithAdapter } from "./columnMapping";
import type { AppField, ColumnMapping, MappingRegistry } from "./mappingRegistry";
import { fingerprintFromHeaders } from "./mappingRegistry";
import { extractLineItemsFromOperationalSheets, type SheetColumnPlan } from "../extractLineItems";
import type {
  CanonicalField,
  CustomerProfile,
  IngestionEvent,
  LineItem,
  MappingAudit,
  MappingMode,
  MenuItem,
  OperatorSettings,
  RawSheet,
} from "../types";

export type { AppField } from "./mappingRegistry";

export interface NormalizedData {
  lineItems: LineItem[];
  mappingAudit: MappingAudit[];
  rowsSkipped: number;
  rowsFlagged: number;
  mappingMode: MappingMode;
  platform: string;
}

export type AdapterResult =
  | { status: "success"; data: NormalizedData; confidence: number; adapterUsed: string }
  | { status: "needs_mapping"; detectedColumns: string[]; bestGuess: Record<AppField, string>; fingerprint: string }
  | { status: "error"; message: string };

const operationalSheetsOf = (rawSheets: RawSheet[]) => rawSheets.filter((s) => s.type === "operational_data");

const isXlsm = (fileName: string) => fileName.toLowerCase().endsWith(".xlsm");

/** EBSFK-style weekly workbook tabs */
export const sheetNameMatchesEbsfkPattern = (name: string) => /\bweek\b.*\bof\b/i.test(name.trim());

const workbookMatchesEbsfkPattern = (rawSheets: RawSheet[]) => rawSheets.some((s) => sheetNameMatchesEbsfkPattern(s.name));

const fingerprintHeaders = (rawSheets: RawSheet[]) => {
  const op = operationalSheetsOf(rawSheets);
  const headers = (op[0] ?? rawSheets[0])?.headers ?? [];
  return headers.filter((h) => String(h ?? "").trim() !== "");
};

const confidenceFromAdapterScore = (score01: number) => Math.max(0, Math.min(100, Math.round(score01 * 100)));

function indexesFromSavedMapping(headers: string[], mapping: Partial<Record<AppField, string>>): Partial<Record<CanonicalField, number>> {
  const indexes: Partial<Record<CanonicalField, number>> = {};
  for (const [field, headerName] of Object.entries(mapping) as [CanonicalField, string][]) {
    if (!headerName?.trim()) continue;
    const target = normalizeColumnHeaderForMatch(headerName);
    const idx = headers.findIndex((h) => normalizeColumnHeaderForMatch(h) === target || h.trim() === headerName.trim());
    if (idx >= 0) indexes[field] = idx;
  }
  return indexes;
}

function planFromManualMapping(sheet: RawSheet, mapping: Partial<Record<AppField, string>>): SheetColumnPlan {
  const indexes = indexesFromSavedMapping(sheet.headers, mapping);
  const audit: MappingAudit[] = (Object.keys(mapping) as CanonicalField[])
    .filter((f) => mapping[f])
    .map((field) => ({
      canonicalField: field,
      detectedColumn: mapping[field] ?? "",
      confidence: indexes[field] !== undefined ? 1 : 0.5,
      mode: indexes[field] !== undefined ? ("auto" as const) : ("manual" as const),
    }));
  const mode: MappingMode = audit.some((a) => a.confidence < 0.75) ? "manual" : "auto";
  return { indexes, audit, mode };
}

function planFromDoorDash(sheet: RawSheet): SheetColumnPlan {
  return mapColumnsWithAdapter(sheet.headers, DoorDashAdapter);
}

function planFromGenericFuzzy(sheet: RawSheet): SheetColumnPlan {
  const { indexes, audit, mode } = matchColumnsFuzzy(sheet.headers);
  return { indexes, audit, mode };
}

function runExtract(
  operationalSheets: RawSheet[],
  adapter: typeof DoorDashAdapter | typeof GenericAdapter,
  getSheetPlan: (sheet: RawSheet) => SheetColumnPlan,
  ctx: {
    existingCustomers: CustomerProfile[];
    menuItems: MenuItem[];
    settings: OperatorSettings;
    importTimestamp: string;
    logs: IngestionEvent[];
  },
): NormalizedData {
  const { staging, mappingAudit, rowsSkipped, rowsFlagged, mappingMode } = extractLineItemsFromOperationalSheets({
    operationalSheets,
    getSheetPlan,
    adapter,
    existingCustomers: ctx.existingCustomers,
    menuItems: ctx.menuItems,
    settings: ctx.settings,
    importTimestamp: ctx.importTimestamp,
    logs: ctx.logs,
  });
  return {
    lineItems: staging,
    mappingAudit,
    rowsSkipped,
    rowsFlagged,
    mappingMode,
    platform: adapter.id,
  };
}

export type RunAdapterRegistryContext = {
  existingCustomers: CustomerProfile[];
  menuItems: MenuItem[];
  settings: OperatorSettings;
  importTimestamp: string;
  logs: IngestionEvent[];
};

export function runAdapterRegistry(
  fileName: string,
  rawSheets: RawSheet[],
  mappingRegistry: MappingRegistry,
  ctx: RunAdapterRegistryContext,
  manualMapping?: Partial<Record<AppField, string>> | null,
): AdapterResult {
  const operational = operationalSheetsOf(rawSheets);
  if (!operational.length) {
    return { status: "error", message: "No operational data sheets detected in this workbook." };
  }

  const fpHeaders = fingerprintHeaders(rawSheets);
  const fingerprint = fingerprintFromHeaders(fpHeaders);

  if (manualMapping && Object.keys(manualMapping).some((k) => manualMapping[k as AppField]?.trim())) {
    const data = runExtract(operational, GenericAdapter, (sheet) => planFromManualMapping(sheet, manualMapping), ctx);
    return { status: "success", data, confidence: 92, adapterUsed: "generic+manual" };
  }

  if (isXlsm(fileName)) {
    const data = runExtract(operational, DoorDashAdapter, planFromDoorDash, ctx);
    return { status: "success", data, confidence: 100, adapterUsed: "doordash" };
  }

  if (workbookMatchesEbsfkPattern(rawSheets)) {
    const data = runExtract(operational, DoorDashAdapter, planFromDoorDash, ctx);
    const merged = operational.flatMap((s) => s.headers);
    const c = confidenceFromAdapterScore(DoorDashAdapter.detectConfidence(merged));
    return { status: "success", data, confidence: Math.max(c, 85), adapterUsed: "doordash" };
  }

  const saved: ColumnMapping | undefined = mappingRegistry.find(fingerprint);
  if (saved?.mapping) {
    const data = runExtract(operational, GenericAdapter, (sheet) => planFromManualMapping(sheet, saved.mapping), ctx);
    return { status: "success", data, confidence: 88, adapterUsed: "generic+saved_mapping" };
  }

  const mergedHeaders = operational[0]?.headers ?? [];
  const fuzzy = matchColumnsFuzzy(mergedHeaders);
  const confidence = fuzzy.confidence;

  if (confidence < 50) {
    return {
      status: "needs_mapping",
      detectedColumns: mergedHeaders,
      bestGuess: fuzzy.bestGuess,
      fingerprint,
    };
  }

  const data = runExtract(operational, GenericAdapter, planFromGenericFuzzy, ctx);
  return { status: "success", data, confidence, adapterUsed: "generic" };
}
