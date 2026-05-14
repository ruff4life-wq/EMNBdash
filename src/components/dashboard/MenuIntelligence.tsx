"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatPercent } from "@/lib/operations/analytics";

export type MenuIntelRow = {
  name: string;
  qty: number;
  revenue: number;
  avgPrice: number;
  feePercent: number;
  variance: boolean;
};

const MENU_FEE_HEADER_TITLE =
  "Fee % = platform fees ÷ gross revenue. Values over 100% indicate a data quality issue in the source file.";

type Props = {
  menu: MenuIntelRow[];
  menuChartKey: "qty" | "revenue";
  setMenuChartKey: (key: "qty" | "revenue") => void;
  currencySymbol: string;
};

export default function MenuIntelligence({ menu, menuChartKey, setMenuChartKey, currencySymbol }: Props) {
  const money = (value: number) => formatMoney(value, currencySymbol);

  return (
    <article className="ops-panel">
      <h2>Menu intelligence</h2>
      <div className="ops-chart-controls">
        <button type="button" className={menuChartKey === "qty" ? "ops-primary" : "ops-secondary"} onClick={() => setMenuChartKey("qty")}>
          By Quantity
        </button>
        <button
          type="button"
          className={menuChartKey === "revenue" ? "ops-primary" : "ops-secondary"}
          onClick={() => setMenuChartKey("revenue")}
        >
          By Revenue
        </button>
      </div>
      {menu.length === 0 ? (
        <p className="ops-muted">No menu data for selected filters. Try adjusting your date range or item selection.</p>
      ) : (
        <>
          {menu.length === 1 && <p className="ops-muted">Showing 1 item for selected filters.</p>}
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={menu} margin={{ bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                tickFormatter={(name: string) => (name.length > 15 ? `${name.slice(0, 15)}…` : name)}
                angle={-45}
                textAnchor="end"
                interval={0}
              />
              <YAxis />
              <Tooltip
                formatter={(value, _name, props) => {
                  const item = props.payload as MenuIntelRow;
                  return [
                    menuChartKey === "qty" ? `${Number(value).toLocaleString()} sold` : money(Number(value)),
                    item.name,
                  ];
                }}
              />
              <Bar dataKey={menuChartKey} fill="#C8B400">
                {menu.map((entry) => (
                  <Cell key={entry.name} fill="#C8B400" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Revenue</th>
              <th>Avg price</th>
              <th title={MENU_FEE_HEADER_TITLE}>
                <span className="cursor-help border-b border-dotted border-current">Fee %</span>
              </th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {menu.map((item) => {
              const badFee = item.feePercent > 100;
              return (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>{item.qty}</td>
                  <td>{money(item.revenue)}</td>
                  <td>{money(item.avgPrice)}</td>
                  <td title={MENU_FEE_HEADER_TITLE}>
                    {badFee ? (
                      <span className="font-bold text-red-600">
                        ⚠️ {formatPercent(item.feePercent)}
                      </span>
                    ) : (
                      formatPercent(item.feePercent)
                    )}
                  </td>
                  <td>{item.variance ? "Review" : "OK"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
