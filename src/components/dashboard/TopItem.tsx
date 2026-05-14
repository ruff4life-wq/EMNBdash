"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/operations/analytics";
import type { LineItem } from "@/lib/operations/types";

type Agg = { name: string; qty: number; revenue: number };

export default function TopItem({ lineItems, currencySymbol }: { lineItems: LineItem[]; currencySymbol: string }) {
  const { hero, topFive, totalRevenue } = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const li of lineItems) {
      const cur = map.get(li.menuItem) ?? { name: li.menuItem, qty: 0, revenue: 0 };
      cur.qty += li.quantitySold;
      cur.revenue += li.grossRevenue;
      map.set(li.menuItem, cur);
    }
    const rows = [...map.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
    const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
    return {
      hero: rows[0] ?? null,
      topFive: rows.slice(0, 5),
      totalRevenue: totalRev,
    };
  }, [lineItems]);

  if (!hero) {
    return (
      <section className="mb-4">
        <h2 className="mb-2 text-base font-extrabold text-stone-900">Top selling item</h2>
        <p className="m-0 text-sm text-stone-600">No line items in the current filter.</p>
      </section>
    );
  }

  const pctOfTotal = totalRevenue > 0 ? (hero.revenue / totalRevenue) * 100 : 0;

  return (
    <section className="mb-4">
      <h2 className="mb-3 text-base font-extrabold text-stone-900">Top selling item</h2>
      <article className="rounded-xl border border-stone-200 bg-white p-6 shadow-md ring-1 ring-stone-100">
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-stone-500">#1 by quantity (revenue tie-break)</p>
        <h3 className="mt-2 mb-4 text-2xl font-extrabold leading-tight text-stone-900 sm:text-3xl">{hero.name}</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <dt className="text-stone-600">Units sold</dt>
            <dd className="m-0 text-lg font-bold text-stone-900">{hero.qty.toLocaleString()}</dd>
          </div>
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <dt className="text-stone-600">Total revenue</dt>
            <dd className="m-0 text-lg font-bold text-stone-900">{formatMoney(hero.revenue, currencySymbol)}</dd>
          </div>
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <dt className="text-stone-600">Share of filtered revenue</dt>
            <dd className="m-0 text-lg font-bold text-stone-900">
              {new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(pctOfTotal)}%
            </dd>
          </div>
        </dl>
      </article>
      {topFive.length > 0 ? (
        <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Top 5 by quantity</p>
          <ol className="m-0 list-decimal space-y-1 pl-5 text-sm text-stone-800">
            {topFive.map((r) => (
              <li key={r.name} className="marker:font-semibold">
                <span className="font-semibold text-stone-900">{r.name}</span>
                <span className="text-stone-600">
                  {" "}
                  — {r.qty.toLocaleString()} units, {formatMoney(r.revenue, currencySymbol)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
