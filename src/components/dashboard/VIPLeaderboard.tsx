"use client";

import { formatMoney, formatPercent } from "@/lib/operations/analytics";

export type VipLeaderRow = {
  name: string;
  tier: string;
  spend: number;
  orders: number;
  aov: number;
  feePercent: number;
  net: number;
};

const VIP_FEE_HEADER_TITLE =
  "Fee % = total fees paid ÷ gross revenue for this customer";

export default function VIPLeaderboard({ leaders, currencySymbol }: { leaders: VipLeaderRow[]; currencySymbol: string }) {
  const money = (value: number) => formatMoney(value, currencySymbol);

  return (
    <article className="ops-panel">
      <h2>VIP customer leaderboard</h2>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tier</th>
              <th>Spend</th>
              <th>Orders</th>
              <th>AOV</th>
              <th title={VIP_FEE_HEADER_TITLE}>
                <span className="cursor-help border-b border-dotted border-current">Fee %</span>
              </th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((leader) => (
              <tr key={leader.name}>
                <td>{leader.name}</td>
                <td>
                  <span className="ops-badge">{leader.tier}</span>
                </td>
                <td>{money(leader.spend)}</td>
                <td>{leader.orders}</td>
                <td>{money(leader.aov)}</td>
                <td title={VIP_FEE_HEADER_TITLE}>{formatPercent(leader.feePercent)}</td>
                <td>{money(leader.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
