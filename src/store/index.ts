"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { registeredPlatformConfigs } from "@/lib/operations/adapters";
import { localStorageAdapter } from "@/store/middleware/persistence";
import type {
  CustomerProfile,
  FilterState,
  ImportRecord,
  IngestionEvent,
  IngestionResult,
  LineItem,
  MappingAudit,
  MenuItem,
  OperatorSettings,
  Order,
} from "@/lib/operations/types";

const nowIso = () => new Date().toISOString();
const makeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const defaultSettings: OperatorSettings = {
  vipSpendPercentile: 80,
  vipMinOrderCount: 3,
  promoHeavyDiscountThreshold: 20,
  atRiskInactivityWindowDays: 30,
  priceVarianceAlertThreshold: 10,
  feeBurdenAlertThreshold: 35,
  defaultDateRange: "all",
  currencySymbol: "$",
  timezone: "UTC",
};

export const defaultFilters: FilterState = {
  startDate: "",
  endDate: "",
  weekLabels: [],
  platforms: [],
  customers: [],
  menuItems: [],
  tiers: [],
  feeBurdenThreshold: 0,
};

const sliceStorageKeys = {
  lineItems: "ebsfk_line_items",
  orders: "ebsfk_orders",
  menuItems: "ebsfk_menu_items",
  customers: "ebsfk_customers",
  platforms: "ebsfk_platforms",
  importLog: "ebsfk_import_log",
  settings: "ebsfk_settings",
  filters: "ebsfk_filters",
} as const;

interface OperationsStore {
  hasHydrated: boolean;
  lineItems: LineItem[];
  orders: Order[];
  menuItems: MenuItem[];
  customers: CustomerProfile[];
  platforms: { id: string; displayName: string }[];
  importLog: ImportRecord[];
  filters: FilterState;
  settings: OperatorSettings;
  ingestionLogs: IngestionEvent[];
  mappingAudit: MappingAudit[];
  newMenuItemNames: string[];
  lastImportRecord: ImportRecord | null;
  setHasHydrated: (value: boolean) => void;
  applyIngestionResult: (result: IngestionResult) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;
  addMenuItem: (input: Omit<MenuItem, "id" | "createdAt" | "updatedAt">) => void;
  updateMenuItem: (id: string, input: Partial<Omit<MenuItem, "id" | "createdAt">>) => void;
  deleteMenuItem: (id: string) => void;
  addDiscoveredMenuItem: (name: string) => void;
  addAllDiscoveredMenuItems: () => void;
  updateCustomer: (id: string, input: Partial<Omit<CustomerProfile, "id" | "createdAt">>) => void;
  updateSettings: (input: Partial<OperatorSettings>) => void;
  resetSettings: () => void;
  importBackup: (payload: Partial<Pick<OperationsStore, "lineItems" | "orders" | "menuItems" | "customers" | "importLog" | "filters" | "settings">>) => void;
  clearImportSummary: () => void;
  resetAllData: () => void;
}

type PersistedSlices = Pick<OperationsStore, keyof typeof sliceStorageKeys>;

const syncSliceStorage = (state: PersistedSlices) => {
  if (typeof window === "undefined") return;
  Object.entries(sliceStorageKeys).forEach(([slice, key]) => {
    void localStorageAdapter.save(key, state[slice as keyof PersistedSlices]);
  });
};

export const useOperationsStore = create<OperationsStore>()(
  persist(
    (set) => ({
      hasHydrated: false,
      lineItems: [],
      orders: [],
      menuItems: [],
      customers: [],
      platforms: registeredPlatformConfigs,
      importLog: [],
      filters: defaultFilters,
      settings: defaultSettings,
      ingestionLogs: [],
      mappingAudit: [],
      newMenuItemNames: [],
      lastImportRecord: null,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      applyIngestionResult: (result) =>
        set((state) => ({
          lineItems: result.lineItems,
          orders: result.orders,
          customers: result.customers,
          importLog: [result.importRecord, ...state.importLog],
          ingestionLogs: [...result.logs, ...state.ingestionLogs].slice(0, 300),
          mappingAudit: result.mappingAudit,
          newMenuItemNames: Array.from(new Set([...result.newMenuItemNames, ...state.newMenuItemNames])),
          lastImportRecord: result.importRecord,
        })),
      setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
      resetFilters: () => set({ filters: defaultFilters }),
      addMenuItem: (input) =>
        set((state) => ({
          menuItems: [
            ...state.menuItems,
            { ...input, id: makeId(), createdAt: nowIso(), updatedAt: nowIso() },
          ],
          newMenuItemNames: state.newMenuItemNames.filter((name) => name !== input.name),
        })),
      updateMenuItem: (id, input) =>
        set((state) => ({
          menuItems: state.menuItems.map((item) =>
            item.id === id ? { ...item, ...input, updatedAt: nowIso() } : item,
          ),
        })),
      deleteMenuItem: (id) => set((state) => ({ menuItems: state.menuItems.filter((item) => item.id !== id) })),
      addDiscoveredMenuItem: (name) =>
        set((state) => ({
          menuItems: [
            ...state.menuItems,
            {
              id: makeId(),
              name,
              price: 0,
              category: "",
              isActive: true,
              platforms: [],
              aliases: [],
              createdAt: nowIso(),
              updatedAt: nowIso(),
            },
          ],
          newMenuItemNames: state.newMenuItemNames.filter((itemName) => itemName !== name),
        })),
      addAllDiscoveredMenuItems: () =>
        set((state) => ({
          menuItems: [
            ...state.menuItems,
            ...state.newMenuItemNames.map((name) => ({
              id: makeId(),
              name,
              price: 0,
              category: "",
              isActive: true,
              platforms: [],
              aliases: [],
              createdAt: nowIso(),
              updatedAt: nowIso(),
            })),
          ],
          newMenuItemNames: [],
        })),
      updateCustomer: (id, input) =>
        set((state) => ({
          customers: state.customers.map((customer) =>
            customer.id === id ? { ...customer, ...input, updatedAt: nowIso() } : customer,
          ),
        })),
      updateSettings: (input) => set((state) => ({ settings: { ...state.settings, ...input } })),
      resetSettings: () => set({ settings: defaultSettings }),
      importBackup: (payload) =>
        set((state) => ({
          lineItems: payload.lineItems ?? state.lineItems,
          orders: payload.orders ?? state.orders,
          menuItems: payload.menuItems ?? state.menuItems,
          customers: payload.customers ?? state.customers,
          importLog: payload.importLog ?? state.importLog,
          filters: payload.filters ? { ...defaultFilters, ...payload.filters } : state.filters,
          settings: payload.settings ? { ...defaultSettings, ...payload.settings } : state.settings,
        })),
      clearImportSummary: () => set({ lastImportRecord: null }),
      resetAllData: () =>
        set({
          lineItems: [],
          orders: [],
          menuItems: [],
          customers: [],
          platforms: registeredPlatformConfigs,
          importLog: [],
          filters: defaultFilters,
          ingestionLogs: [],
          mappingAudit: [],
          newMenuItemNames: [],
          lastImportRecord: null,
        }),
    }),
    {
      name: "ebsfk_operations_store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        lineItems: state.lineItems,
        orders: state.orders,
        menuItems: state.menuItems,
        customers: state.customers,
        platforms: state.platforms,
        importLog: state.importLog,
        filters: state.filters,
        settings: state.settings,
        ingestionLogs: state.ingestionLogs,
        mappingAudit: state.mappingAudit,
        newMenuItemNames: state.newMenuItemNames,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        if (state) syncSliceStorage(state);
        console.info("Dashboard hydration completion", {
          lineItems: state?.lineItems.length ?? 0,
          orders: state?.orders.length ?? 0,
          customers: state?.customers.length ?? 0,
        });
      },
    },
  ),
);

useOperationsStore.subscribe((state) => syncSliceStorage(state));


