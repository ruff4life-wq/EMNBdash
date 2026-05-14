import type { LineItem } from "../types";

const EPS = 1e-9;

/**
 * When the same fee appears on every line and the **sum** of those fees exceeds total
 * order gross, exports are usually repeating one order-level fee per row. Use a
 * single charge (`ref`). Otherwise use the summed line fees (already split, or
 * legitimate multi-line fees).
 */
function consolidateOrderFeeTotal(perLineFees: number[], orderGross: number): number {
  const rawSum = perLineFees.reduce((a, b) => a + b, 0);
  if (perLineFees.length <= 1) return rawSum;
  const ref = perLineFees[0]!;
  const uniform = perLineFees.every(
    (v) => Math.abs(v - ref) <= EPS * Math.max(1, Math.abs(ref)),
  );
  if (uniform && ref > 0 && rawSum > orderGross + EPS) {
    return ref;
  }
  return rawSum;
}

/**
 * Fix 1 — fee normalization: assign each line a revenue share of the order's
 * platform and marketing fees so line-level fee % matches the order rate
 * (order_fee / order_gross). Handles duplicated order-level fees on every row.
 * Recomputes `netNetPayout` from gross, allocated fees, discounts, and credits.
 */
export function distributeOrderFeesAcrossLineItems(lineItems: LineItem[]): LineItem[] {
  const byOrder = new Map<string, LineItem[]>();
  for (const item of lineItems) {
    const list = byOrder.get(item.orderId);
    if (list) list.push(item);
    else byOrder.set(item.orderId, [item]);
  }

  const normalizedById = new Map<string, LineItem>();

  for (const items of byOrder.values()) {
    const orderGross = items.reduce((sum, item) => sum + item.grossRevenue, 0);
    const orderMarketing = consolidateOrderFeeTotal(
      items.map((i) => i.marketingFees),
      orderGross,
    );
    const orderPlatform = consolidateOrderFeeTotal(
      items.map((i) => i.doorDashFees),
      orderGross,
    );

    if (orderGross <= 0) {
      for (const item of items) {
        normalizedById.set(item.id, { ...item });
      }
      continue;
    }

    for (const item of items) {
      const share = item.grossRevenue / orderGross;
      const marketingFees = orderMarketing * share;
      const doorDashFees = orderPlatform * share;
      const netNetPayout =
        item.grossRevenue - doorDashFees - marketingFees - item.customerDiscounts + item.marketingCredits;
      normalizedById.set(item.id, {
        ...item,
        doorDashFees,
        marketingFees,
        netNetPayout,
      });
    }
  }

  return lineItems.map((item) => normalizedById.get(item.id) ?? item);
}
