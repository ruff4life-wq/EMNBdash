import type { CustomerProfile, FilterState, LineItem, MenuItem, Order } from "./types";

const dayMs = 86400 * 1000;

export const formatMoney = (value: number, symbol: string) =>
  `${symbol}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)}`;

export const formatPercent = (value: number) =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`;

export const formatDateLabel = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));

export const deriveFilterOptions = (orders: Order[], lineItems: LineItem[], customers: CustomerProfile[]) => ({
  dateBounds: orders.length
    ? {
        min: orders.reduce((min, order) => (order.orderDate < min ? order.orderDate : min), orders[0].orderDate),
        max: orders.reduce((max, order) => (order.orderDate > max ? order.orderDate : max), orders[0].orderDate),
      }
    : { min: "", max: "" },
  weekLabels: Array.from(new Set(orders.map((order) => order.weekLabel))).sort(),
  platforms: Array.from(new Set(orders.map((order) => order.sourcePlatform))).sort(),
  customers: Array.from(new Set(orders.map((order) => order.customerName))).sort(),
  menuItems: Array.from(new Set(lineItems.map((item) => item.menuItem))).sort(),
  tiers: Array.from(new Set(customers.map((customer) => customer.tier))).sort(),
});

export const applyFilters = (
  orders: Order[],
  lineItems: LineItem[],
  customers: CustomerProfile[],
  filters: FilterState,
) => {
  const customerTierMap = new Map(customers.map((customer) => [customer.displayName, customer.tier]));
  const filteredOrders = orders.filter((order) => {
    if (filters.startDate && order.orderDate.slice(0, 10) < filters.startDate) return false;
    if (filters.endDate && order.orderDate.slice(0, 10) > filters.endDate) return false;
    if (filters.weekLabels.length && !filters.weekLabels.includes(order.weekLabel)) return false;
    if (filters.platforms.length && !filters.platforms.includes(order.sourcePlatform)) return false;
    if (filters.customers.length && !filters.customers.includes(order.customerName)) return false;
    if (filters.tiers.length && !filters.tiers.includes(customerTierMap.get(order.customerName) ?? "unassigned")) return false;
    if (filters.feeBurdenThreshold > 0 && order.feePercent < filters.feeBurdenThreshold) return false;
    return true;
  });
  const orderIds = new Set(filteredOrders.map((order) => order.orderId));
  const filteredLineItems = lineItems.filter((item) => {
    if (!orderIds.has(item.orderId)) return false;
    if (filters.menuItems.length && !filters.menuItems.includes(item.menuItem)) return false;
    return true;
  });
  return { filteredOrders, filteredLineItems };
};

// Correct benchmark values (manual sum of four weekly operational sheets, EBSFK workbook, Apr 2–May 3 2025):
// Gross revenue: verified against weekly sheet totals (Executive Snapshot excluded — contains out-of-sheet adjustments)
// Net payout: verified against weekly sheet totals
// Fee adjustment rows (grossRevenue=0, nonzero payout, blank item) are excluded from all aggregations.
export const computeExecutiveOverview = (orders: Order[]) => {
  const totalGrossRevenue = orders.reduce((sum, order) => sum + order.totalGrossRevenue, 0);
  const totalNetPayout = orders.reduce((sum, order) => sum + order.totalNetNetPayout, 0);
  const totalOrders = orders.length;
  const platformFees = orders.reduce((sum, order) => sum + order.totalDoorDashFees, 0);
  const marketingFees = orders.reduce((sum, order) => sum + order.totalMarketingFees, 0);
  const dates = orders.map((order) => order.orderDate).sort();
  return {
    totalGrossRevenue,
    totalNetPayout,
    totalOrders,
    averageOrderValue: totalOrders ? totalGrossRevenue / totalOrders : 0,
    platformFeeBurden: totalGrossRevenue ? (platformFees / totalGrossRevenue) * 100 : 0,
    marketingFeeBurden: totalGrossRevenue ? (marketingFees / totalGrossRevenue) * 100 : 0,
    activeDateRangeLabel: dates.length ? `${formatDateLabel(dates[0])} - ${formatDateLabel(dates[dates.length - 1])}` : "",
    weeksCovered: new Set(orders.map((order) => order.weekLabel)).size,
  };
};

export const revenueByDay = (orders: Order[]) =>
  Array.from(
    orders.reduce((map, order) => {
      const key = order.orderDate.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + order.totalGrossRevenue);
      return map;
    }, new Map<string, number>()),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date: formatDateLabel(date), revenue }));

export const customerLeaderboard = (orders: Order[], customers: CustomerProfile[]) => {
  const customerTierMap = new Map(customers.map((customer) => [customer.displayName, customer.tier]));
  const byCustomer = orders.reduce((map, order) => {
      const current = map.get(order.customerName) ?? {
        name: order.customerName,
        tier: customerTierMap.get(order.customerName) ?? "unassigned",
        spend: 0,
        orders: 0,
        fees: 0,
        net: 0,
      };
      current.spend += order.totalGrossRevenue;
      current.orders += 1;
      current.fees += order.totalDoorDashFees + order.totalMarketingFees;
      current.net += order.totalNetNetPayout;
      map.set(order.customerName, current);
      return map;
    }, new Map<string, { name: string; tier: string; spend: number; orders: number; fees: number; net: number }>());
  return Array.from(byCustomer.values())
    .map((entry) => ({
      ...entry,
      aov: entry.orders ? entry.spend / entry.orders : 0,
      feePercent: entry.spend ? (entry.fees / entry.spend) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
};

export const menuIntelligence = (lineItems: LineItem[], menuItems: MenuItem[], varianceThreshold: number) => {
  const menuMap = new Map(menuItems.flatMap((item) => [item.name, ...item.aliases].map((name) => [name.toLowerCase(), item])));
  const byItem = lineItems.reduce((map, item) => {
      const current = map.get(item.menuItem) ?? { name: item.menuItem, qty: 0, revenue: 0, fees: 0, variance: false };
      current.qty += item.quantitySold;
      current.revenue += item.grossRevenue;
      current.fees += item.doorDashFees + item.marketingFees;
      const menu = menuMap.get(item.menuItem.toLowerCase());
      if (menu && item.quantitySold > 0 && menu.price > 0) {
        const variance = Math.abs(item.grossRevenue / item.quantitySold - menu.price) / menu.price;
        current.variance = current.variance || variance > varianceThreshold / 100;
      }
      map.set(item.menuItem, current);
      return map;
    }, new Map<string, { name: string; qty: number; revenue: number; fees: number; variance: boolean }>());
  return Array.from(byItem.values())
    .map((entry) => ({
      ...entry,
      avgPrice: entry.qty ? entry.revenue / entry.qty : 0,
      feePercent: entry.revenue ? (entry.fees / entry.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
};

export const simulateProfit = (orders: Order[], feeOverridePercent: number) => {
  const actual = orders.reduce((sum, order) => sum + order.totalNetNetPayout, 0);
  const simulated = orders.reduce(
    (sum, order) => sum + order.totalGrossRevenue * (1 - feeOverridePercent / 100) - order.totalDiscounts + order.totalMarketingCredits,
    0,
  );
  return { actual, simulated, delta: simulated - actual };
};

export const priorPeriodStart = (orders: Order[]) => {
  if (!orders.length) return "";
  const sorted = orders.map((order) => new Date(order.orderDate).getTime()).sort((a, b) => a - b);
  return new Date(sorted[0] - (sorted[sorted.length - 1] - sorted[0] + dayMs)).toISOString();
};
