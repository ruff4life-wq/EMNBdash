"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/operations/analytics";
import type { Order } from "@/lib/operations/types";

const medals = ["🥇", "🥈", "🥉"] as const;

export default function TopCustomers({ orders, currencySymbol }: { orders: Order[]; currencySymbol: string }) {
  const top = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; orderCount: number }>();
    for (const o of orders) {
      const cur = map.get(o.customerName) ?? { name: o.customerName, spend: 0, orderCount: 0 };
      cur.spend += o.totalGrossRevenue;
      cur.orderCount += 1;
      map.set(o.customerName, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 3)
      .map((row, i) => ({
        ...row,
        rank: i + 1,
        medal: medals[i] ?? `${i + 1}`,
        aov: row.orderCount ? row.spend / row.orderCount : 0,
      }));
  }, [orders]);

  if (top.length === 0) {
    return (
      <section className="mb-4">
        <h2 className="mb-2 text-base font-extrabold text-stone-900">Top 3 customers by spending</h2>
        <p className="m-0 text-sm text-stone-600">No customer orders in the current filter.</p>
      </section>
    );
  }

  return (
    <section className="mb-4">
      <h2 className="mb-3 text-base font-extrabold text-stone-900">Top 3 customers by spending</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {top.map((row) => (
          <article
            key={row.name}
            className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm ring-1 ring-amber-100/80"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-2xl" aria-hidden>
                {row.medal}
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">#{row.rank}</span>
            </div>
            <h3 className="m-0 line-clamp-2 text-lg font-bold text-stone-900">{row.name}</h3>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-stone-600">Total gross spend</dt>
                <dd className="m-0 font-bold text-stone-900">{formatMoney(row.spend, currencySymbol)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-600">Orders</dt>
                <dd className="m-0 font-semibold text-stone-900">{row.orderCount}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-600">Avg order value</dt>
                <dd className="m-0 font-semibold text-stone-900">{formatMoney(row.aov, currencySymbol)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
