import { DoorDashAdapter } from "./doordash";
import { GenericAdapter, canonicalFieldHints } from "./generic";
import { mapColumnsWithAdapter } from "./columnMapping";
import {
  COLUMN_MAPPINGS_STORAGE_KEY,
  createLocalStorageMappingStore,
  createMemoryMappingRegistry,
  fingerprintFromHeaders,
  type AppField,
  type ColumnMapping,
  type MappingRegistry,
} from "./mappingRegistry";
import { runAdapterRegistry, type AdapterResult, type NormalizedData, type RunAdapterRegistryContext } from "./registry";

export {
  DoorDashAdapter,
  GenericAdapter,
  canonicalFieldHints,
  mapColumnsWithAdapter,
  COLUMN_MAPPINGS_STORAGE_KEY,
  createLocalStorageMappingStore,
  createMemoryMappingRegistry,
  fingerprintFromHeaders,
  runAdapterRegistry,
};
export type {
  AppField,
  ColumnMapping,
  MappingRegistry,
  AdapterResult,
  NormalizedData,
  RunAdapterRegistryContext,
};

/** @deprecated Use runAdapterRegistry — kept for transitional imports */
export const platformAdapters = [DoorDashAdapter, GenericAdapter];

export const registeredPlatformConfigs = platformAdapters.map((adapter) => ({
  id: adapter.id,
  displayName: adapter.displayName,
}));

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
