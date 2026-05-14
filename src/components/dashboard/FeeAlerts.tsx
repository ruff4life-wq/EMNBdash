"use client";

import { useMemo } from "react";
import { formatMoney, formatPercent } from "@/lib/operations/analytics";
import type { LineItem } from "@/lib/operations/types";

function lineFeeUsd(item: LineItem) {
  return item.doorDashFees + item.marketingFees;
}

function lineFeePercent(item: LineItem) {
  if (item.grossRevenue <= 0) return 0;
  return (lineFeeUsd(item) / item.grossRevenue) * 100;
}

export default function FeeAlerts({ lineItems, currencySymbol }: { lineItems: LineItem[]; currencySymbol: string }) {
  const flagged = useMemo(() => {
    return lineItems
      .map((item) => ({ item, feePct: lineFeePercent(item), feeUsd: lineFeeUsd(item) }))
      .filter(({ feePct }) => feePct > 25)
      .sort((a, b) => b.feePct - a.feePct);
  }, [lineItems]);

  if (flagged.length === 0) {
    return (
      <section
        className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800 shadow-sm"
        aria-label="Marketing fee alerts"
      >
        <p className="m-0 text-sm font-semibold">✓ All fees within 25% threshold</p>
        <p className="mt-1 mb-0 text-xs text-green-700">
          No line items in the current filter where platform + marketing fees exceed 25% of gross revenue.
        </p>
      </section>
    );
  }

  return (
    <section
      className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-red-900 shadow-sm"
      aria-label="Marketing fee alerts"
    >
      <h2 className="m-0 text-base font-extrabold tracking-tight text-red-800">
        ⚠️ Marketing Fee Alerts — Fees Exceeding 25%
      </h2>
      <p className="mt-1 mb-3 text-sm text-red-700">
        Items where platform fees consumed more than 25% of gross revenue ({flagged.length}{" "}
        {flagged.length === 1 ? "line" : "lines"}).
      </p>
      <div className="overflow-x-auto rounded-md border border-red-200 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-red-100 bg-red-100/80 text-red-900">
              <th className="px-3 py-2 font-bold">Customer</th>
              <th className="px-3 py-2 font-bold">Item</th>
              <th className="px-3 py-2 font-bold">Gross revenue</th>
              <th className="px-3 py-2 font-bold">Fee $</th>
              <th className="px-3 py-2 font-bold">Fee %</th>
            </tr>
          </thead>
          <tbody>
            {flagged.map(({ item, feePct, feeUsd }) => (
              <tr key={item.id} className="border-b border-red-50 last:border-0">
                <td className="max-w-[180px] truncate px-3 py-2 font-medium text-red-950">{item.customerName}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-red-900">{item.menuItem}</td>
                <td className="whitespace-nowrap px-3 py-2 text-red-900">{formatMoney(item.grossRevenue, currencySymbol)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-red-800">{formatMoney(feeUsd, currencySymbol)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-bold text-amber-800">{formatPercent(feePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
