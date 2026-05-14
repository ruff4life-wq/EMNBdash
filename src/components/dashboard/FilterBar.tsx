"use client";

import { useMemo } from "react";
import { deriveFilterOptions } from "@/lib/operations/analytics";
import { useOperationsStore } from "@/store";

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

export default function FilterBar() {
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
