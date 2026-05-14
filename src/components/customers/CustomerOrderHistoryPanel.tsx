"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { formatMoney, formatPercent } from "@/lib/operations/analytics";
import type { CustomerProfile, LineItem, Order } from "@/lib/operations/types";

const TIERS = ["vip", "loyal", "promo_heavy", "new", "at_risk", "unassigned"] as const;

function marketingFeePctForOrder(order: Order): number {
  const revenuePerOrder = order.totalGrossRevenue;
  if (revenuePerOrder <= 0) return 0;
  return (order.totalMarketingFees / revenuePerOrder) * 100;
}

function lineFeeUsd(item: LineItem) {
  return item.doorDashFees + item.marketingFees;
}

type Props = {
  customer: CustomerProfile;
  customerOrders: Order[];
  customerLineItems: LineItem[];
  currencySymbol: string;
  onClose: () => void;
  onUpdateTier: (tier: (typeof TIERS)[number]) => void;
};

export default function CustomerOrderHistoryPanel({
  customer,
  customerOrders,
  customerLineItems,
  currencySymbol,
  onClose,
  onUpdateTier,
}: Props) {
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(() => new Set());
  const money = (n: number) => formatMoney(n, currencySymbol);

  const sortedOrders = useMemo(
    () => [...customerOrders].sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [customerOrders],
  );

  const summary = useMemo(() => {
    const totalOrders = customerOrders.length;
    const totalGross = customerOrders.reduce((s, o) => s + o.totalGrossRevenue, 0);
    const aov = totalOrders ? totalGross / totalOrders : 0;
    const qtyByItem = new Map<string, number>();
    for (const li of customerLineItems) {
      qtyByItem.set(li.menuItem, (qtyByItem.get(li.menuItem) ?? 0) + li.quantitySold);
    }
    const ranked = [...qtyByItem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const mostOrdered = ranked[0]?.[0] ?? null;
    return { totalOrders, totalGross, aov, mostOrdered };
  }, [customerOrders, customerLineItems]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleOrder = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const linesByOrder = useMemo(() => {
    const map = new Map<string, LineItem[]>();
    for (const li of customerLineItems) {
      const list = map.get(li.orderId) ?? [];
      list.push(li);
      map.set(li.orderId, list);
    }
    return map;
  }, [customerLineItems]);

  return (
    <div className="ops-slideover-root" role="dialog" aria-modal="true" aria-labelledby="customer-order-history-title">
      <button type="button" className="ops-slideover-backdrop" aria-label="Close panel" onClick={onClose} />
      <div className="ops-slideover-panel">
        <div className="ops-slideover-panel-header">
          <div>
            <p className="ops-kicker" style={{ marginBottom: 4 }}>Order history</p>
            <h2 id="customer-order-history-title" style={{ margin: 0, fontSize: "1.25rem" }}>
              {customer.displayName}
            </h2>
          </div>
          <button type="button" className="ops-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="ops-slideover-panel-body">
          <section className="ops-panel" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <span className="ops-badge">{customer.tier}</span>
              <label className="ops-field" style={{ minWidth: 180, margin: 0 }}>
                <span>Tier override</span>
                <select
                  value={customer.tier}
                  onChange={(e) => onUpdateTier(e.target.value as (typeof TIERS)[number])}
                >
                  {TIERS.map((tier) => (
                    <option key={tier} value={tier}>{tier}</option>
                  ))}
                </select>
              </label>
            </div>
            <dl className="ops-summary-grid">
              <div><dt>Total orders</dt><dd>{summary.totalOrders}</dd></div>
              <div><dt>Total gross revenue</dt><dd>{money(summary.totalGross)}</dd></div>
              <div><dt>Avg order value</dt><dd>{money(summary.aov)}</dd></div>
              <div><dt>Most ordered item</dt><dd>{summary.mostOrdered ?? "—"}</dd></div>
            </dl>
          </section>

          {customerOrders.length === 0 ? (
            <p className="ops-muted" style={{ margin: 0 }}>No orders in selected date range.</p>
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order total</th>
                    <th>Net payout</th>
                    <th>Fee %</th>
                    <th>Items</th>
                    <th aria-label="Expand" />
                  </tr>
                </thead>
                <tbody>
                  {sortedOrders.map((order) => {
                    const expanded = expandedOrderIds.has(order.orderId);
                    const itemNames = customerLineItems
                      .filter((li) => li.orderId === order.orderId)
                      .map((li) => li.menuItem)
                      .join(", ");
                    const mktPct = marketingFeePctForOrder(order);
                    return (
                      <Fragment key={order.orderId}>
                        <tr>
                          <td>{order.orderDate.slice(0, 10)}</td>
                          <td>{money(order.totalGrossRevenue)}</td>
                          <td>{money(order.totalNetNetPayout)}</td>
                          <td title="Marketing fees ÷ order total gross revenue">{formatPercent(mktPct)}</td>
                          <td style={{ whiteSpace: "normal", maxWidth: 280 }}>{itemNames || "—"}</td>
                          <td>
                            <button type="button" className="ops-secondary" onClick={() => toggleOrder(order.orderId)}>
                              {expanded ? "Hide lines" : "Line items"}
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr>
                            <td colSpan={6} style={{ paddingTop: 0, borderBottom: "1px solid #e6efeb" }}>
                              <div className="ops-order-lines">
                                <table className="ops-table">
                                  <thead>
                                    <tr>
                                      <th>Item</th>
                                      <th>Qty</th>
                                      <th>Gross</th>
                                      <th>Fee $</th>
                                      <th>Fee %</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(linesByOrder.get(order.orderId) ?? []).map((li) => (
                                      <tr key={li.id}>
                                        <td>{li.menuItem}</td>
                                        <td>{li.quantitySold}</td>
                                        <td>{money(li.grossRevenue)}</td>
                                        <td>{money(lineFeeUsd(li))}</td>
                                        <td title="Order-level marketing fee rate (marketing ÷ order gross)">
                                          {formatPercent(mktPct)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
