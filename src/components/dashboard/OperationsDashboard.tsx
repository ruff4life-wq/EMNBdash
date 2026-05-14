"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  applyFilters,
  computeExecutiveOverview,
  customerLeaderboard,
  deriveFilterOptions,
  formatMoney,
  formatPercent,
  menuIntelligence,
  revenueByDay,
  simulateProfit,
} from "@/lib/operations/analytics";
import { DropZone, validateWorkbookFileForImport } from "@/components/import/DropZone";
import { getMappingRegistry } from "@/components/import/mappingRegistryClient";
import { MappingModal, type MappingModalPayload } from "@/components/import/MappingModal";
import { SavedColumnMappingsCard } from "@/components/import/SavedColumnMappingsCard";
import type { AppField } from "@/lib/operations/adapters";
import { ingestFile } from "@/lib/operations/ingestion";
import { useOperationsStore } from "@/store";
import FeeAlerts from "@/components/dashboard/FeeAlerts";
import MenuIntelligence from "@/components/dashboard/MenuIntelligence";
import RepeatCustomers from "@/components/dashboard/RepeatCustomers";
import TopCustomers from "@/components/dashboard/TopCustomers";
import TopItem from "@/components/dashboard/TopItem";
import VIPLeaderboard from "@/components/dashboard/VIPLeaderboard";
import type { CustomerTier, MenuItem } from "@/lib/operations/types";

const tabs = ["dashboard", "menu", "customers", "settings", "dev"] as const;
type Tab = (typeof tabs)[number];

const fieldList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function EmptyState({ onPickFile }: { onPickFile: () => void }) {
  return (
    <section className="ops-empty">
      <p className="ops-kicker">No imports yet</p>
      <h1>Restaurant Operations Intelligence</h1>
      <p>
        Import a platform export to reconstruct orders, discover customers, audit fees, and populate every dashboard control from live data.
      </p>
      <button type="button" className="ops-primary" onClick={onPickFile}>
        Import spreadsheet
      </button>
    </section>
  );
}

function ImportSummary() {
  const record = useOperationsStore((state) => state.lastImportRecord);
  const clearImportSummary = useOperationsStore((state) => state.clearImportSummary);
  if (!record) return null;
  return (
    <div className="ops-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="import-summary-title">
      <div className="ops-modal">
        <h2 id="import-summary-title">Import summary</h2>
        <dl className="ops-summary-grid">
          <div><dt>Rows imported</dt><dd>{record.rowsImported}</dd></div>
          <div><dt>Rows skipped</dt><dd>{record.rowsSkipped}</dd></div>
          <div><dt>Rows flagged</dt><dd>{record.rowsFlagged}</dd></div>
          <div><dt>Duplicates</dt><dd>{record.duplicatesResolved}</dd></div>
          <div><dt>Sheets processed</dt><dd>{record.sheetsProcessed}</dd></div>
          <div><dt>Mapping mode</dt><dd>{record.mappingMode}</dd></div>
        </dl>
        <button type="button" className="ops-primary" onClick={clearImportSummary}>Close</button>
      </div>
    </div>
  );
}

type ToastItem = { id: string; tone: "success" | "warning"; message: string };

function ToastStack({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="ops-toast-stack" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`ops-toast ${item.tone === "success" ? "ops-toast-success" : "ops-toast-warn"}`}>
          {item.message}
          <button type="button" className="ops-secondary" style={{ marginLeft: 10 }} onClick={() => onDismiss(item.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

function FileImporter({
  isImporting,
  importError,
  onFileAccepted,
  onValidationError,
}: {
  isImporting: boolean;
  importError: string;
  onFileAccepted: (file: File) => void;
  onValidationError: (message: string) => void;
}) {
  return (
    <div className="ops-import">
      <DropZone
        disabled={isImporting}
        onFileAccepted={onFileAccepted}
        onValidationError={onValidationError}
        label={isImporting ? "Importing..." : "Drop or choose export"}
      />
      {importError ? <p className="ops-error">{importError}</p> : null}
    </div>
  );
}

function MultiSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string[];
  options: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <label className="ops-field">
      <span>{label}</span>
      <select
        multiple
        value={value}
        onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function FilterBar() {
  const { orders, lineItems, customers, filters, setFilters, resetFilters } = useOperationsStore();
  const options = useMemo(() => deriveFilterOptions(orders, lineItems, customers), [orders, lineItems, customers]);
  return (
    <section className="ops-panel ops-filters">
      <label className="ops-field">
        <span>Start</span>
        <input type="date" min={options.dateBounds.min.slice(0, 10)} max={options.dateBounds.max.slice(0, 10)} value={filters.startDate} onChange={(event) => setFilters({ startDate: event.target.value })} />
      </label>
      <label className="ops-field">
        <span>End</span>
        <input type="date" min={options.dateBounds.min.slice(0, 10)} max={options.dateBounds.max.slice(0, 10)} value={filters.endDate} onChange={(event) => setFilters({ endDate: event.target.value })} />
      </label>
      <MultiSelect label="Weeks" value={filters.weekLabels} options={options.weekLabels} onChange={(weekLabels) => setFilters({ weekLabels })} />
      <MultiSelect label="Platforms" value={filters.platforms} options={options.platforms} onChange={(platforms) => setFilters({ platforms })} />
      <MultiSelect label="Customers" value={filters.customers} options={options.customers} onChange={(customers) => setFilters({ customers })} />
      <MultiSelect label="Items" value={filters.menuItems} options={options.menuItems} onChange={(menuItems) => setFilters({ menuItems })} />
      <button type="button" className="ops-secondary" onClick={resetFilters}>Reset filters</button>
    </section>
  );
}

function DashboardView() {
  const { orders, lineItems, customers, menuItems, filters, settings, setFilters } = useOperationsStore();
  const { filteredOrders, filteredLineItems } = useMemo(
    () => applyFilters(orders, lineItems, customers, filters),
    [orders, lineItems, customers, filters],
  );
  const overview = useMemo(() => computeExecutiveOverview(filteredOrders), [filteredOrders]);
  const revenue = useMemo(() => revenueByDay(filteredOrders), [filteredOrders]);
  const leaders = useMemo(() => customerLeaderboard(filteredOrders, customers), [filteredOrders, customers]);
  const menu = useMemo(
    () => menuIntelligence(filteredLineItems, menuItems, settings.priceVarianceAlertThreshold),
    [filteredLineItems, menuItems, settings.priceVarianceAlertThreshold],
  );
  const [simulationFee, setSimulationFee] = useState(settings.feeBurdenAlertThreshold);
  const [menuChartKey, setMenuChartKey] = useState<"qty" | "revenue">("qty");
  const simulation = useMemo(() => simulateProfit(filteredOrders, simulationFee), [filteredOrders, simulationFee]);
  const money = (value: number) => formatMoney(value, settings.currencySymbol);

  if (!orders.length) return null;

  return (
    <>
      <FeeAlerts lineItems={filteredLineItems} currencySymbol={settings.currencySymbol} />

      <section className="ops-kpi-grid">
        {[
          ["Total Gross Revenue", money(overview.totalGrossRevenue)],
          ["Total Net Payout", money(overview.totalNetPayout)],
          ["Total Orders", overview.totalOrders.toString()],
          ["Average Order Value", money(overview.averageOrderValue)],
          ["Platform Fee Burden", formatPercent(overview.platformFeeBurden)],
          ["Marketing Fee Burden", formatPercent(overview.marketingFeeBurden)],
          ["Active Date Range", overview.activeDateRangeLabel],
          ["Weeks Covered", overview.weeksCovered.toString()],
        ].map(([label, value]) => (
          <article className="ops-kpi" key={label}>
            <span>{label}</span>
            <strong>{value || "No data"}</strong>
          </article>
        ))}
      </section>

      <TopCustomers orders={filteredOrders} currencySymbol={settings.currencySymbol} />
      <RepeatCustomers orders={filteredOrders} currencySymbol={settings.currencySymbol} />
      <TopItem lineItems={filteredLineItems} currencySymbol={settings.currencySymbol} />

      <section className="ops-grid">
        <article className="ops-panel">
          <h2>Revenue over time</h2>
          {revenue.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Line type="monotone" dataKey="revenue" stroke="#1D8A6E" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="ops-muted">No filtered revenue rows.</p>
          )}
        </article>
      </section>

      <section className="ops-grid">
        <VIPLeaderboard leaders={leaders} currencySymbol={settings.currencySymbol} />
        <MenuIntelligence
          menu={menu}
          menuChartKey={menuChartKey}
          setMenuChartKey={setMenuChartKey}
          currencySymbol={settings.currencySymbol}
        />
      </section>

      <section className="ops-grid">
        <article className="ops-panel">
          <h2>Profit simulator</h2>
          <label className="ops-field">
            <span>Fee override</span>
            <input type="range" min={0} max={60} value={simulationFee} onChange={(event) => setSimulationFee(Number(event.target.value))} />
          </label>
          <dl className="ops-summary-grid">
            <div><dt>Override</dt><dd>{formatPercent(simulationFee)}</dd></div>
            <div><dt>Actual</dt><dd>{money(simulation.actual)}</dd></div>
            <div><dt>Simulated</dt><dd>{money(simulation.simulated)}</dd></div>
            <div><dt>Delta</dt><dd>{money(simulation.delta)}</dd></div>
          </dl>
          <label className="ops-field">
            <span>Fee burden filter</span>
            <input type="range" min={0} max={settings.feeBurdenAlertThreshold} value={filters.feeBurdenThreshold} onChange={(event) => setFilters({ feeBurdenThreshold: Number(event.target.value) })} />
          </label>
        </article>
      </section>

      <FilterBar />
    </>
  );
}

function MenuManager() {
  const { menuItems, platforms, lineItems, addMenuItem, updateMenuItem, deleteMenuItem, newMenuItemNames, addDiscoveredMenuItem, addAllDiscoveredMenuItems } = useOperationsStore();
  const [draft, setDraft] = useState({ name: "", price: "", category: "", platforms: "", aliases: "" });
  const lastSeen = useMemo(() => {
    const map = new Map<string, string>();
    lineItems.forEach((item) => map.set(item.menuItem, item.orderDate));
    return map;
  }, [lineItems]);

  const submit = () => {
    if (!draft.name || Number.isNaN(Number(draft.price))) return;
    addMenuItem({
      name: draft.name,
      price: Number(draft.price),
      category: draft.category,
      isActive: true,
      platforms: fieldList(draft.platforms),
      aliases: fieldList(draft.aliases),
    });
    setDraft({ name: "", price: "", category: "", platforms: "", aliases: "" });
  };

  return (
    <section className="ops-panel">
      <h2>Menu manager</h2>
      {newMenuItemNames.length ? (
        <div className="ops-detected">
          <button type="button" className="ops-primary" onClick={addAllDiscoveredMenuItems}>
            Add all {newMenuItemNames.length} detected items to menu
          </button>
          {newMenuItemNames.map((name) => (
            <button key={name} type="button" onClick={() => addDiscoveredMenuItem(name)}>+ {name}</button>
          ))}
        </div>
      ) : null}
      <div className="ops-form-grid">
        <input placeholder="Item name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <input placeholder="Price" type="number" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
        <input placeholder="Category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
        <input placeholder={`Platforms: ${platforms.map((platform) => platform.id).join(", ")}`} value={draft.platforms} onChange={(event) => setDraft({ ...draft, platforms: event.target.value })} />
        <input placeholder="Aliases (e.g. FRIED FISH COMBO for FRIED FISH HOAGIE COMBO) — comma-separated" value={draft.aliases} onChange={(event) => setDraft({ ...draft, aliases: event.target.value })} />
        <button type="button" className="ops-primary" onClick={submit}>Add item</button>
      </div>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead><tr><th>Name</th><th>Price</th><th>Category</th><th>Active</th><th>Platforms</th><th>Last seen</th><th>Actions</th></tr></thead>
          <tbody>
            {menuItems.map((item: MenuItem) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.price}</td>
                <td>{item.category}</td>
                <td><input type="checkbox" checked={item.isActive} onChange={(event) => updateMenuItem(item.id, { isActive: event.target.checked })} /></td>
                <td>{item.platforms.join(", ")}</td>
                <td>{lastSeen.get(item.name)?.slice(0, 10) ?? ""}</td>
                <td>
                  <button type="button" className="ops-secondary" onClick={() => updateMenuItem(item.id, { isActive: false })}>Deactivate</button>
                  <button type="button" className="ops-danger" onClick={() => deleteMenuItem(item.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CustomerDirectory() {
  const { customers, orders, updateCustomer } = useOperationsStore();
  const metrics = useMemo(() => customerLeaderboard(orders, customers), [orders, customers]);
  const metricsMap = new Map(metrics.map((item) => [item.name, item]));
  const [editingId, setEditingId] = useState("");
  return (
    <section className="ops-panel">
      <h2>Customer directory</h2>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead><tr><th>Name</th><th>Tier</th><th>Orders</th><th>Spend</th><th>Last order</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>
            {customers.map((customer) => {
              const metric = metricsMap.get(customer.displayName);
              const isEditing = editingId === customer.id;
              return (
                <tr key={customer.id}>
                  <td>{isEditing ? <input value={customer.displayName} onChange={(event) => updateCustomer(customer.id, { displayName: event.target.value })} /> : customer.displayName}</td>
                  <td>
                    <select value={customer.tier} onChange={(event) => updateCustomer(customer.id, { tier: event.target.value as CustomerTier, tierOverride: true })}>
                      {["vip", "loyal", "promo_heavy", "new", "at_risk", "unassigned"].map((tier) => <option key={tier}>{tier}</option>)}
                    </select>
                  </td>
                  <td>{metric?.orders ?? 0}</td>
                  <td>{metric ? formatMoney(metric.spend, useOperationsStore.getState().settings.currencySymbol) : ""}</td>
                  <td>{customer.lastSeen.slice(0, 10)}</td>
                  <td>{isEditing ? <input value={customer.notes} onChange={(event) => updateCustomer(customer.id, { notes: event.target.value })} /> : customer.notes}</td>
                  <td><button type="button" className="ops-secondary" onClick={() => setEditingId(isEditing ? "" : customer.id)}>{isEditing ? "Done" : "Edit"}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsPanel({ hideSavedMappings }: { hideSavedMappings?: boolean }) {
  const { settings, updateSettings, resetSettings, lineItems, orders, menuItems, customers, importLog, filters, importBackup } = useOperationsStore();
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ lineItems, orders, menuItems, customers, importLog, filters, settings }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `operations-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const restoreData = async (file: File | undefined) => {
    if (!file) return;
    importBackup(JSON.parse(await file.text()));
  };
  return (
    <>
      {!hideSavedMappings ? <SavedColumnMappingsCard /> : null}
      <section className="ops-panel">
      <h2>Settings</h2>
      <div className="ops-form-grid">
        {[
          ["vipSpendPercentile", "VIP spend percentile"],
          ["vipMinOrderCount", "VIP min order count"],
          ["promoHeavyDiscountThreshold", "Promo discount threshold"],
          ["atRiskInactivityWindowDays", "At risk inactivity days"],
          ["priceVarianceAlertThreshold", "Price variance threshold"],
          ["feeBurdenAlertThreshold", "Fee burden threshold"],
        ].map(([key, label]) => (
          <label className="ops-field" key={key}>
            <span>{label}</span>
            <input type="number" value={settings[key as keyof typeof settings] as number} onChange={(event) => updateSettings({ [key]: Number(event.target.value) })} />
          </label>
        ))}
        <label className="ops-field"><span>Currency symbol</span><input value={settings.currencySymbol} onChange={(event) => updateSettings({ currencySymbol: event.target.value })} /></label>
        <label className="ops-field"><span>Timezone</span><input value={settings.timezone} onChange={(event) => updateSettings({ timezone: event.target.value })} /></label>
      </div>
      <div className="ops-actions">
        <button type="button" className="ops-primary" onClick={exportData}>Export App Data</button>
        <label className="ops-secondary ops-import-backup">Import App Data<input type="file" accept=".json" onChange={(event) => restoreData(event.target.files?.[0])} /></label>
        <button type="button" className="ops-danger" onClick={resetSettings}>Reset defaults</button>
      </div>
    </section>
    </>
  );
}

function DevPanel() {
  const { lineItems, orders, customers, menuItems, importLog, ingestionLogs, mappingAudit, filters } = useOperationsStore();
  return (
    <section className="ops-panel">
      <h2>Dev panel</h2>
      <details open><summary>Store size</summary><pre>{JSON.stringify({ lineItems: lineItems.length, orders: orders.length, customers: customers.length, menuItems: menuItems.length, importLog: importLog.length }, null, 2)}</pre></details>
      <details><summary>Filter state</summary><pre>{JSON.stringify(filters, null, 2)}</pre></details>
      <details><summary>Mapping audit</summary><pre>{JSON.stringify(mappingAudit, null, 2)}</pre></details>
      <details><summary>Ingestion log</summary><pre>{JSON.stringify(ingestionLogs.slice(0, 80), null, 2)}</pre></details>
      <details><summary>Normalized data preview</summary><pre>{JSON.stringify(lineItems.slice(0, 25), null, 2)}</pre></details>
      <details><summary>Order reconstruction log</summary><pre>{JSON.stringify(orders.slice(0, 25), null, 2)}</pre></details>
    </section>
  );
}

export default function OperationsDashboard({
  initialTab = "dashboard",
  dedicatedSettingsRoute = false,
}: {
  initialTab?: Tab;
  dedicatedSettingsRoute?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [mappingPayload, setMappingPayload] = useState<MappingModalPayload | null>(null);

  const pushToast = useCallback((tone: ToastItem["tone"], message: string) => {
    const id = `${Date.now()}`;
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ingestOutcomeHandler = useCallback(
    (outcome: Awaited<ReturnType<typeof ingestFile>>, file: File) => {
      const state = useOperationsStore.getState();
      if (outcome.status === "needs_mapping") {
        setMappingFile(file);
        setMappingPayload({
          detectedColumns: outcome.detectedColumns,
          bestGuess: outcome.bestGuess,
          fingerprint: outcome.fingerprint,
          rawSheets: outcome.rawSheets,
        });
        setMappingOpen(true);
        return;
      }
      if (outcome.status === "error") {
        setImportError(outcome.message);
        return;
      }
      state.applyIngestionResult(outcome.result);
      if (outcome.confidence >= 80) {
        pushToast("success", `Import complete (${outcome.adapterUsed}, confidence ${outcome.confidence}).`);
      } else if (outcome.confidence >= 50) {
        pushToast("warning", `Imported with moderate confidence (${outcome.confidence}). Verify totals and fee columns.`);
      }
    },
    [pushToast],
  );

  const runWorkbookIngest = useCallback(
    async (file: File, manualMapping: Partial<Record<AppField, string>> | null = null) => {
      const v = validateWorkbookFileForImport(file);
      if (v) {
        setImportError(v);
        return;
      }
      setImportError("");
      setIsImporting(true);
      try {
        const st = useOperationsStore.getState();
        const outcome = await ingestFile({
          file,
          existingLineItems: st.lineItems,
          existingCustomers: st.customers,
          menuItems: st.menuItems,
          settings: st.settings,
          mappingRegistry: getMappingRegistry(),
          manualColumnMapping: manualMapping,
        });
        ingestOutcomeHandler(outcome, file);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Import failed";
        console.error(message);
        setImportError(message);
      } finally {
        setIsImporting(false);
      }
    },
    [ingestOutcomeHandler],
  );

  const handleMappingImport = useCallback(
    async (mapping: Partial<Record<AppField, string>>, saveFingerprint: boolean) => {
      const file = mappingFile;
      const payload = mappingPayload;
      if (!file || !payload) return;
      setIsImporting(true);
      setImportError("");
      try {
        const st = useOperationsStore.getState();
        const outcome = await ingestFile({
          file,
          existingLineItems: st.lineItems,
          existingCustomers: st.customers,
          menuItems: st.menuItems,
          settings: st.settings,
          mappingRegistry: getMappingRegistry(),
          manualColumnMapping: mapping,
        });
        if (outcome.status !== "complete") {
          throw new Error(outcome.status === "error" ? outcome.message : "Could not import with this mapping.");
        }
        st.applyIngestionResult(outcome.result);
        if (saveFingerprint) {
          getMappingRegistry().save({
            fingerprint: payload.fingerprint,
            label: `${file.name} (${payload.fingerprint.slice(0, 8)})`,
            mapping,
          });
        }
        if (outcome.confidence >= 80) {
          pushToast("success", `Import complete (${outcome.adapterUsed}, confidence ${outcome.confidence}).`);
        } else if (outcome.confidence >= 50) {
          pushToast("warning", `Imported with moderate confidence (${outcome.confidence}). Verify totals and fee columns.`);
        }
        setMappingOpen(false);
        setMappingFile(null);
        setMappingPayload(null);
      } finally {
        setIsImporting(false);
      }
    },
    [mappingFile, mappingPayload, pushToast],
  );

  const hasHydrated = useOperationsStore((state) => state.hasHydrated);
  const orderCount = useOperationsStore((state) => state.orders.length);
  const hasPersistedOpsData = useOperationsStore(
    (state) =>
      state.orders.length > 0 ||
      state.lineItems.length > 0 ||
      state.customers.length > 0 ||
      state.menuItems.length > 0 ||
      state.importLog.length > 0 ||
      state.newMenuItemNames.length > 0,
  );
  const resetAllData = useOperationsStore((state) => state.resetAllData);

  useEffect(() => {
    if (!hasHydrated) return;
    const state = useOperationsStore.getState();
    if (!state.orders.length) return;
    if (state.filters.startDate || state.filters.endDate) return;
    const dates = state.orders.map((o) => o.orderDate);
    const minDate = dates.reduce((a, b) => (a < b ? a : b)).slice(0, 10);
    const maxDate = dates.reduce((a, b) => (a > b ? a : b)).slice(0, 10);
    state.setFilters({ startDate: minDate, endDate: maxDate });
  }, [hasHydrated]);
  const fileInputId = "ops-hidden-import";

  if (!hasHydrated) return <main className="ops-shell"><p className="ops-muted">Hydrating dashboard...</p></main>;

  return (
    <main className="ops-shell">
      <ToastStack items={toasts} onDismiss={dismissToast} />
      <MappingModal
        open={mappingOpen && !!mappingFile && !!mappingPayload}
        file={mappingFile}
        payload={mappingPayload}
        onClose={() => {
          setMappingOpen(false);
          setMappingFile(null);
          setMappingPayload(null);
        }}
        onImport={handleMappingImport}
      />
      <input
        id={fileInputId}
        hidden
        type="file"
        accept=".csv,.xlsx,.xlsm,.xls"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (event.target) event.target.value = "";
          if (!file) return;
          await runWorkbookIngest(file, null);
        }}
      />
      <header className="ops-header">
        <div>
          <p className="ops-kicker">Operator-first intelligence</p>
          <h1>Restaurant Operations Dashboard</h1>
        </div>
        <div className="ops-header-actions">
          {hasPersistedOpsData ? (
            <button
              type="button"
              className="ops-danger"
              onClick={() => {
                const ok = window.confirm(
                  "Remove all orders, line items, customers, menu catalog, and import history from this browser? Settings such as currency and thresholds are kept. This cannot be undone.",
                );
                if (ok) resetAllData();
              }}
            >
              Reset all data
            </button>
          ) : null}
          <FileImporter
            isImporting={isImporting}
            importError={importError}
            onFileAccepted={(file) => void runWorkbookIngest(file, null)}
            onValidationError={setImportError}
          />
        </div>
      </header>
      {dedicatedSettingsRoute && activeTab === "settings" ? (
        <div style={{ padding: "0 0 12px" }}>
          <SavedColumnMappingsCard />
        </div>
      ) : null}
      <nav className="ops-tabs" aria-label="Operations sections">
        {tabs.map((tab) => (
          <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </nav>
      {!orderCount && activeTab === "dashboard" ? (
        <EmptyState onPickFile={() => document.getElementById(fileInputId)?.click()} />
      ) : null}
      {activeTab === "dashboard" ? <DashboardView /> : null}
      {activeTab === "menu" ? <MenuManager /> : null}
      {activeTab === "customers" ? <CustomerDirectory /> : null}
      {activeTab === "settings" ? <SettingsPanel hideSavedMappings={dedicatedSettingsRoute} /> : null}
      {activeTab === "dev" ? <DevPanel /> : null}
      <ImportSummary />
    </main>
  );
}


