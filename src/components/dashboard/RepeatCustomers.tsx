"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/operations/analytics";
import type { Order } from "@/lib/operations/types";

export default function RepeatCustomers({ orders, currencySymbol }: { orders: Order[]; currencySymbol: string }) {
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; orderCount: number }>();
    for (const o of orders) {
      const cur = map.get(o.customerName) ?? { name: o.customerName, spend: 0, orderCount: 0 };
      cur.spend += o.totalGrossRevenue;
      cur.orderCount += 1;
      map.set(o.customerName, cur);
    }
    return [...map.values()]
      .filter((r) => r.orderCount >= 2)
      .sort((a, b) => b.spend - a.spend)
      .map((r) => ({
        ...r,
        avgPerOrder: r.orderCount ? r.spend / r.orderCount : 0,
      }));
  }, [orders]);

  return (
    <section className="mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="m-0 text-base font-extrabold text-stone-900">Repeat customers</h2>
      <p className="mt-1 mb-3 text-sm text-stone-600">Customers with two or more orders in the current filtered range.</p>
      {rows.length === 0 ? (
        <p className="m-0 rounded-md border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-600">
          No repeat customers in this period — expand your date range to see loyalty trends.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-700">
                <th className="py-2 pr-3 font-bold">Name</th>
                <th className="py-2 pr-3 font-bold">Orders</th>
                <th className="py-2 pr-3 font-bold">Avg / order</th>
                <th className="py-2 pr-3 font-bold">Lifetime spend</th>
                <th className="py-2 font-bold"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-stone-100 last:border-0">
                  <td className="max-w-[200px] truncate py-2 pr-3 font-medium text-stone-900">{r.name}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-stone-800">{r.orderCount}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-stone-800">{formatMoney(r.avgPerOrder, currencySymbol)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-semibold text-stone-900">{formatMoney(r.spend, currencySymbol)}</td>
                  <td className="py-2">
                    <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-800">
                      Loyal
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
