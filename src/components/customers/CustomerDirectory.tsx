"use client";

import { useMemo, useState } from "react";
import { applyFilters, customerLeaderboard, formatMoney } from "@/lib/operations/analytics";
import FilterBar from "@/components/dashboard/FilterBar";
import { useOperationsStore } from "@/store";
import type { CustomerProfile, CustomerTier, LineItem, Order } from "@/lib/operations/types";
import CustomerOrderHistoryPanel from "./CustomerOrderHistoryPanel";

function namesMatch(orderName: string, displayName: string) {
  return orderName.trim().toLocaleLowerCase("en-US") === displayName.trim().toLocaleLowerCase("en-US");
}

function filterForCustomer(orders: Order[], lineItems: LineItem[], displayName: string) {
  const o = orders.filter((order) => namesMatch(order.customerName, displayName));
  const ids = new Set(o.map((x) => x.orderId));
  const li = lineItems.filter((item) => ids.has(item.orderId) && namesMatch(item.customerName, displayName));
  return { customerOrders: o, customerLineItems: li };
}

export default function CustomerDirectory() {
  const { customers, orders, lineItems, filters, updateCustomer, settings } = useOperationsStore();
  const metrics = useMemo(() => customerLeaderboard(orders, customers), [orders, customers]);
  const metricsMap = new Map(metrics.map((item) => [item.name, item]));
  const [editingId, setEditingId] = useState("");
  const [selected, setSelected] = useState<CustomerProfile | null>(null);

  const { filteredOrders, filteredLineItems } = useMemo(
    () => applyFilters(orders, lineItems, customers, filters),
    [orders, lineItems, customers, filters],
  );

  const drillData = useMemo(() => {
    if (!selected) return { customerOrders: [] as Order[], customerLineItems: [] as LineItem[] };
    const live = customers.find((c) => c.id === selected.id) ?? selected;
    return filterForCustomer(filteredOrders, filteredLineItems, live.displayName);
  }, [selected, customers, filteredOrders, filteredLineItems]);

  return (
    <>
      <FilterBar />
      <section className="ops-panel">
        <h2>Customer directory</h2>
        <p className="ops-muted" style={{ marginTop: 0 }}>
          Select a row to view order history for the current filters. Tier changes apply immediately.
        </p>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Tier</th>
                <th>Orders</th>
                <th>Spend</th>
                <th>Last order</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const metric = metricsMap.get(customer.displayName);
                const isEditing = editingId === customer.id;
                return (
                  <tr
                    key={customer.id}
                    className={isEditing ? undefined : "ops-table-row-clickable"}
                    onClick={() => {
                      if (isEditing) return;
                      setSelected(customer);
                    }}
                  >
                    <td>
                      {isEditing ? (
                        <input
                          value={customer.displayName}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(event) => updateCustomer(customer.id, { displayName: event.target.value })}
                        />
                      ) : (
                        customer.displayName
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        value={customer.tier}
                        onChange={(event) =>
                          updateCustomer(customer.id, {
                            tier: event.target.value as CustomerTier,
                            tierOverride: true,
                          })
                        }
                      >
                        {["vip", "loyal", "promo_heavy", "new", "at_risk", "unassigned"].map((tier) => (
                          <option key={tier} value={tier}>{tier}</option>
                        ))}
                      </select>
                    </td>
                    <td>{metric?.orders ?? 0}</td>
                    <td>{metric ? formatMoney(metric.spend, settings.currencySymbol) : ""}</td>
                    <td>{customer.lastSeen.slice(0, 10)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {isEditing ? (
                        <input
                          value={customer.notes}
                          onChange={(event) => updateCustomer(customer.id, { notes: event.target.value })}
                        />
                      ) : (
                        customer.notes
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="ops-secondary" onClick={() => setEditingId(isEditing ? "" : customer.id)}>
                        {isEditing ? "Done" : "Edit"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <CustomerOrderHistoryPanel
          customer={customers.find((c) => c.id === selected.id) ?? selected}
          customerOrders={drillData.customerOrders}
          customerLineItems={drillData.customerLineItems}
          currencySymbol={settings.currencySymbol}
          onClose={() => setSelected(null)}
          onUpdateTier={(tier) => {
            updateCustomer(selected.id, { tier, tierOverride: true });
          }}
        />
      ) : null}
    </>
  );
}
