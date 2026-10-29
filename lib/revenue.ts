/**
 * Revenue and sales totals, shared by the Invoices page and the dashboard so the numbers always match.
 *
 * Revenue (money received) = paid complaint invoices
 *                          + paid shop-purchase invoices + shop purchases without an invoice
 *                          + money technicians have paid for their items (full or part payments)
 * Sales                    = all shop purchases + all technician items (bill for used items)
 *
 * A shop purchase that has its own invoice is counted once, through that invoice.
 */

export interface RevenueInvoice {
  amount: number;
  status: string;
  invoice_date: string;
  purchase_id: string | null;
}
export interface RevenueShopSale {
  id: string;
  amount: number;
  purchase_date: string;
}
export interface RevenueTechItem {
  total_amount: number;
  payment_status: string;
  paid_amount?: number | null;
  purchase_date: string;
}

/** Money received so far for a technician item: all of it when paid, the part paid when partial. */
export function techPaidAmount(item: Pick<RevenueTechItem, "total_amount" | "payment_status" | "paid_amount">) {
  const total = Number(item.total_amount);
  if (item.payment_status === "paid") return total;
  if (item.payment_status === "partial") return Math.min(Number(item.paid_amount ?? 0), total);
  return 0;
}

/** Money still owed for a technician item. */
export function techDueAmount(item: Pick<RevenueTechItem, "total_amount" | "payment_status" | "paid_amount">) {
  return Number(item.total_amount) - techPaidAmount(item);
}

export function computeRevenue(
  invoices: RevenueInvoice[],
  shopSales: RevenueShopSale[],
  techItems: RevenueTechItem[],
  inRange: (date: string) => boolean = () => true,
) {
  const paidInvoices = invoices.filter((i) => i.status === "paid" && inRange(i.invoice_date));
  const sales = shopSales.filter((s) => inRange(s.purchase_date));
  // Returned-in-full items have a bill of 0 and are left out
  const tech = techItems.filter((t) => Number(t.total_amount) > 0 && inRange(t.purchase_date));

  const invoicedSaleIds = new Set(invoices.map((i) => i.purchase_id).filter(Boolean));
  const sum = (values: number[]) => values.reduce((total, v) => total + Number(v), 0);

  const complaintRevenue = sum(paidInvoices.filter((i) => !i.purchase_id).map((i) => i.amount));
  const salesRevenue =
    sum(paidInvoices.filter((i) => i.purchase_id).map((i) => i.amount)) +
    sum(sales.filter((s) => !invoicedSaleIds.has(s.id)).map((s) => s.amount)) +
    sum(tech.map(techPaidAmount));

  return {
    complaintRevenue,
    salesRevenue,
    revenue: complaintRevenue + salesRevenue,
    shopSalesCount: sales.length,
    techSalesCount: tech.length,
    salesCount: sales.length + tech.length,
    salesTotal: sum(sales.map((s) => s.amount)) + sum(tech.map((t) => t.total_amount)),
  };
}
