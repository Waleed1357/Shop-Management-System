"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";
import { ArrowRight, CalendarDays, ChevronDown, CircleCheck, Clock, Users, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Complaint, Invoice, ShopPurchase } from "@/lib/types";
import { techDueAmount, techPaidAmount } from "@/lib/revenue";
import { MONTHS, cn, errorMessage, formatDate, formatMoney, todayISO } from "@/lib/utils";
import { Card, Table } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import MetricCard from "@/components/ui/MetricCard";
import { useToast } from "@/components/providers/ToastProvider";
import { useComplaintSaved } from "@/components/providers/ComplaintModalProvider";
import { BarChart, LineChart } from "./Charts";

type ComplaintRow = Pick<Complaint, "id" | "complaint_no" | "client_name" | "phone" | "complaint_date" | "status" | "technician">;
type InvoiceRow = Pick<Invoice, "amount" | "status" | "invoice_date" | "purchase_id">;
type ShopSaleRow = Pick<ShopPurchase, "id" | "customer_name" | "phone" | "product" | "amount" | "purchase_date">;
type TechnicianPurchaseRow = {
  id: string;
  item_name: string;
  quantity: number;
  returned_quantity: number;
  total_amount: number;
  payment_status: "paid" | "partial" | "pending";
  paid_amount: number | null;
  purchase_date: string;
  technician: { name: string; phone: string | null } | null;
};
/** One row in "Recent sales": a walk-in shop purchase or an item a technician took. */
type SaleRow = {
  key: string;
  kind: "shop" | "technician";
  who: string;
  phone: string;
  product: string;
  date: string;
  amount: number;
  paid: boolean;
};
type ChartRange = "weekly" | "monthly" | "yearly";
type DashboardRange = "this-month" | "last-month" | "last-3-months" | "this-year" | "all-time" | "custom";
type DateRange = { start: string; end: string; label: string; valid: boolean };

function clientKey(name: string) {
  return name.trim().toLocaleLowerCase();
}

function getDashboardRange(range: DashboardRange, today: string, customStart: string, customEnd: string): DateRange {
  if (!today) return { start: "", end: "", label: "This month", valid: false };
  const current = new Date(`${today}T00:00:00`);
  const startOfMonth = dateKey(new Date(current.getFullYear(), current.getMonth(), 1));

  if (range === "custom") {
    const valid = Boolean(customStart && customEnd && customStart <= customEnd);
    return {
      start: customStart,
      end: customEnd,
      label: valid ? `${customStart} – ${customEnd}` : "Select dates",
      valid,
    };
  }
  if (range === "all-time") return { start: "", end: today, label: "All time", valid: true };
  if (range === "last-month") {
    return {
      start: dateKey(new Date(current.getFullYear(), current.getMonth() - 1, 1)),
      end: dateKey(new Date(current.getFullYear(), current.getMonth(), 0)),
      label: "Last month",
      valid: true,
    };
  }
  if (range === "last-3-months") {
    return {
      start: dateKey(new Date(current.getFullYear(), current.getMonth() - 2, 1)),
      end: today,
      label: "Last 3 months",
      valid: true,
    };
  }
  if (range === "this-year") {
    return { start: `${current.getFullYear()}-01-01`, end: today, label: "This year", valid: true };
  }
  return { start: startOfMonth, end: today, label: "This month", valid: true };
}

function isInDateRange(date: string | null | undefined, range: DateRange) {
  return Boolean(date && range.valid && date <= range.end && (!range.start || date >= range.start));
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getChartPeriods(range: ChartRange, today: string) {
  if (!today) return [{ key: "", label: "" }];

  const end = new Date(`${today}T00:00:00`);
  if (range === "yearly") {
    return MONTHS.map((label, index) => ({
      key: `${end.getFullYear()}-${String(index + 1).padStart(2, "0")}`,
      label,
    }));
  }

  const days = range === "weekly" ? 7 : 30;
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - days + index + 1);
    return {
      key: dateKey(date),
      label: range === "weekly"
        ? date.toLocaleDateString("en", { weekday: "short" })
        : String(date.getDate()),
    };
  });
}

export default function Dashboard() {
  const toast = useToast();
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [technicianPurchases, setTechnicianPurchases] = useState<TechnicianPurchaseRow[]>([]);
  const [shopSales, setShopSales] = useState<ShopSaleRow[]>([]);
  const [today, setToday] = useState("");
  const [chartRange, setChartRange] = useState<ChartRange>("monthly");
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>("this-month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeControlRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  const selectedRange = useMemo(
    () => getDashboardRange(dashboardRange, today, customStart, customEnd),
    [dashboardRange, today, customStart, customEnd],
  );

  const load = useCallback(async () => {
    const supabase = createClient();
    const [c, i, t, s] = await Promise.all([
      supabase
        .from("complaints")
        .select("id, complaint_no, client_name, phone, complaint_date, status, technician")
        .order("created_at", { ascending: false }),
      supabase.from("invoices").select("amount, status, invoice_date, purchase_id"),
      supabase
        .from("technician_purchases")
        .select("id, item_name, quantity, returned_quantity, total_amount, payment_status, paid_amount, purchase_date, technician:technicians(name, phone)"),
      supabase
        .from("shop_purchases")
        .select("id, customer_name, phone, product, amount, purchase_date")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    const err = c.error ?? i.error ?? t.error ?? s.error;
    if (err) toast(errorMessage(err), "error");
    setComplaints((c.data as ComplaintRow[]) ?? []);
    setInvoices((i.data as InvoiceRow[]) ?? []);
    setTechnicianPurchases((t.data as unknown as TechnicianPurchaseRow[]) ?? []);
    setShopSales((s.data as ShopSaleRow[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    const t = todayISO();
    /* eslint-disable react-hooks/set-state-in-effect -- needs the browser clock and remote data */
    setToday(t);
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  useEffect(() => {
    if (!rangeOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rangeControlRef.current?.contains(event.target)) {
        setRangeOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [rangeOpen]);

  // A complaint or shop purchase added from the top bar should show up right away.
  useComplaintSaved(() => load());
  useEffect(() => {
    window.addEventListener("shop-purchase-saved", load);
    return () => window.removeEventListener("shop-purchase-saved", load);
  }, [load]);

  const firstSeenByClient = useMemo(() => {
    const firstSeen = new Map<string, string>();
    complaints.forEach((complaint) => {
      const key = clientKey(complaint.client_name);
      const currentDate = firstSeen.get(key);
      if (key && (!currentDate || complaint.complaint_date < currentDate)) {
        firstSeen.set(key, complaint.complaint_date);
      }
    });
    return firstSeen;
  }, [complaints]);

  const stats = useMemo(() => {
    const periodInvoices = invoices.filter((invoice) => isInDateRange(invoice.invoice_date, selectedRange));
    const paid = periodInvoices.filter((invoice) => invoice.status === "paid");
    const paidTechnicianPurchases = technicianPurchases.filter(
      (purchase) => purchase.payment_status !== "pending" && isInDateRange(purchase.purchase_date, selectedRange),
    );
    const clientsInRange = [...firstSeenByClient.values()].filter((date) => isInDateRange(date, selectedRange));

    // Shop sales in range. A sale that has its own invoice is already counted through that
    // invoice, so only sales WITHOUT an invoice are added to revenue here (no double counting).
    const salesInRange = shopSales.filter((sale) => isInDateRange(sale.purchase_date, selectedRange));
    const invoicedSaleIds = new Set(invoices.map((invoice) => invoice.purchase_id).filter(Boolean));
    const uninvoicedSalesTotal = salesInRange
      .filter((sale) => !invoicedSaleIds.has(sale.id))
      .reduce((sum, sale) => sum + Number(sale.amount), 0);
    // Items technicians took (bill for used items; fully returned items are 0 and left out)
    const techSalesInRange = technicianPurchases.filter(
      (purchase) => Number(purchase.total_amount) > 0 && isInDateRange(purchase.purchase_date, selectedRange),
    );

    // Revenue (money received) = complaint invoices paid + sales paid
    const complaintRevenue = paid
      .filter((invoice) => !invoice.purchase_id)
      .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    const salesRevenue =
      paid.filter((invoice) => invoice.purchase_id).reduce((sum, invoice) => sum + Number(invoice.amount), 0) +
      uninvoicedSalesTotal +
      paidTechnicianPurchases.reduce((sum, purchase) => sum + techPaidAmount(purchase), 0);

    return {
      clients: clientsInRange.length,
      allClients: firstSeenByClient.size,
      complaintRevenue,
      salesRevenue,
      revenue: complaintRevenue + salesRevenue,
      // Awaiting payment = pending invoices + technician items not paid yet
      // (fully returned items have a bill of 0, so they're left out).
      ...(() => {
        const pendingInvoices = periodInvoices.filter((invoice) => invoice.status === "pending");
        const partialInvoices = periodInvoices.filter((invoice) => invoice.status === "partial");
        const pendingTech = technicianPurchases.filter(
          (purchase) =>
            techDueAmount(purchase) > 0 &&
            isInDateRange(purchase.purchase_date, selectedRange),
        );
        const partialTech = technicianPurchases.filter(
          (purchase) =>
            purchase.payment_status === "partial" &&
            isInDateRange(purchase.purchase_date, selectedRange),
        );
        return {
          pendingInvoiceCount: pendingInvoices.length,
          pendingTechCount: pendingTech.length,
          pendingCount: pendingInvoices.length + pendingTech.length,
          pendingAmount:
            pendingInvoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0) +
            pendingTech.reduce((sum, purchase) => sum + techDueAmount(purchase), 0),
          partialInvoiceCount: partialInvoices.length,
          partialTechCount: partialTech.length,
          partialCount: partialInvoices.length + partialTech.length,
        };
      })(),
      // Shop sales = walk-in purchases + items technicians took
      shopSalesCount: salesInRange.length,
      techSalesCount: techSalesInRange.length,
      salesCount: salesInRange.length + techSalesInRange.length,
      salesTotal:
        salesInRange.reduce((sum, sale) => sum + Number(sale.amount), 0) +
        techSalesInRange.reduce((sum, purchase) => sum + Number(purchase.total_amount), 0),
      paidCount: paid.length,
      clientsInRange,
    };
  }, [firstSeenByClient, invoices, selectedRange, technicianPurchases, shopSales]);

  // Shop purchases and technician items together, newest first
  const periodSales = useMemo<SaleRow[]>(() => {
    const shop: SaleRow[] = shopSales
      .filter((sale) => isInDateRange(sale.purchase_date, selectedRange))
      .map((sale) => ({
        key: `s-${sale.id}`,
        kind: "shop",
        who: sale.customer_name,
        phone: sale.phone,
        product: sale.product,
        date: sale.purchase_date,
        amount: Number(sale.amount),
        paid: true,
      }));
    const tech: SaleRow[] = technicianPurchases
      .filter((p) => Number(p.total_amount) > 0 && isInDateRange(p.purchase_date, selectedRange))
      .map((p) => {
        const used = p.quantity - p.returned_quantity;
        return {
          key: `t-${p.id}`,
          kind: "technician",
          who: p.technician?.name ?? "Technician",
          phone: p.technician?.phone ?? "",
          product: used > 1 ? `${p.item_name} × ${used}` : p.item_name,
          date: p.purchase_date,
          amount: Number(p.total_amount),
          paid: p.payment_status === "paid",
        };
      });
    return [...shop, ...tech].sort((a, b) => b.date.localeCompare(a.date));
  }, [shopSales, technicianPurchases, selectedRange]);

  const chartData = useMemo(() => {
    const periods = getChartPeriods(chartRange, selectedRange.end || today);
    const clientCounts = periods.map(({ key }) =>
      stats.clientsInRange.filter((date) =>
        chartRange === "yearly" ? date.startsWith(key) : date === key,
      ).length,
    );
    const growth = clientCounts.reduce<number[]>((totals, count) => {
      totals.push((totals.at(-1) ?? 0) + count);
      return totals;
    }, []);
    return {
      labels: periods.map(({ label }) => label),
      clientCounts,
      growth,
      newClients: clientCounts.reduce((total, count) => total + count, 0),
    };
  }, [chartRange, stats.clientsInRange, selectedRange.end, today]);

  const chartRangeLabel = chartRange === "weekly" ? "last 7 days" : chartRange === "monthly" ? "last 30 days" : `in ${selectedRange.end.slice(0, 4)}`;
  const periodComplaints = useMemo(
    () => complaints.filter((complaint) => isInDateRange(complaint.complaint_date, selectedRange)),
    [complaints, selectedRange],
  );

  function chooseDashboardRange(range: DashboardRange) {
    setDashboardRange(range);
    if (range === "custom" && today) {
      setCustomStart(dateKey(new Date(`${today.slice(0, 7)}-01T00:00:00`)));
      setCustomEnd(today);
    } else if (range !== "custom") {
      setRangeOpen(false);
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Overview for {selectedRange.label.toLocaleLowerCase()}</p>
        </div>
        <div ref={rangeControlRef} className="relative z-20 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setRangeOpen((open) => !open)}
            aria-expanded={rangeOpen}
            aria-haspopup="dialog"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <CalendarDays className="size-4 text-slate-500" />
            <span>{selectedRange.label}</span>
            <ChevronDown className={cn("size-4 text-slate-400 transition-transform", rangeOpen && "rotate-180")} />
          </button>
          {rangeOpen && (
            <div role="dialog" aria-label="Select dashboard date range" className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="grid grid-cols-2 gap-1">
                {([
                  ["this-month", "This month"],
                  ["last-month", "Last month"],
                  ["last-3-months", "Last 3 months"],
                  ["this-year", "This year"],
                  ["all-time", "All time"],
                  ["custom", "Custom range"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseDashboardRange(value)}
                    aria-pressed={dashboardRange === value}
                    className={cn(
                      "min-h-9 rounded-lg px-2 text-left text-xs font-medium transition-colors",
                      dashboardRange === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {dashboardRange === "custom" && (
                <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    From
                    <input
                      type="date"
                      value={customStart}
                      max={customEnd || today}
                      onChange={(event) => setCustomStart(event.target.value)}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    To
                    <input
                      type="date"
                      value={customEnd}
                      min={customStart}
                      max={today}
                      onChange={(event) => setCustomEnd(event.target.value)}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                    />
                  </label>
                  {!selectedRange.valid && <p role="alert" className="text-xs text-red-600">Choose a valid start and end date.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={<Users className="size-5" />} tone="bg-blue-50 text-blue-600" label="Clients in range" value={stats.clients.toLocaleString()} loading={loading} href={ROUTES.clients} />
        <MetricCard icon={<CircleCheck className="size-5" />} tone="bg-violet-50 text-violet-600" label="Paid invoices" value={stats.paidCount.toLocaleString()} loading={loading} href={ROUTES.invoices} />
        <MetricCard icon={<Clock className="size-5" />} tone="bg-amber-50 text-amber-600" label="Awaiting payment" value={stats.pendingCount.toLocaleString()} loading={loading} href={ROUTES.technicians} />
        <MetricCard icon={<WalletCards className="size-5" />} tone="bg-sky-50 text-sky-600" label="Partial payment" value={stats.partialCount.toLocaleString()} loading={loading} href={ROUTES.invoices} />
      </div>

      <section aria-label="Client statistics" className="mb-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Client statistics</h2>
            <p className="mt-1 text-sm text-slate-500">Track new clients and service growth over time.</p>
          </div>
          <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Chart time range">
            {(["weekly", "monthly", "yearly"] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setChartRange(range)}
                aria-pressed={chartRange === range}
                className={cn(
                  "min-h-9 rounded-lg px-3 text-xs font-semibold capitalize transition-colors sm:px-4",
                  chartRange === range ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">New clients</p>
              <h3 className="mt-1 font-semibold text-slate-900">Total clients</h3>
              <p className="mt-1 text-xs text-slate-500">{chartData.newClients} new client{chartData.newClients === 1 ? "" : "s"} {chartRangeLabel}</p>
            </div>
            <div className="-mx-1 rounded-xl bg-slate-50/70 px-1 pt-2">
              <BarChart labels={chartData.labels} values={chartData.clientCounts} format={(value) => `${value} client${value === 1 ? "" : "s"}`} />
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Cumulative clients</p>
              <h3 className="mt-1 font-semibold text-slate-900">Growth</h3>
              <p className="mt-1 text-xs text-slate-500">{chartData.newClients} new client{chartData.newClients === 1 ? "" : "s"} added {chartRangeLabel}</p>
            </div>
            <div className="-mx-1 rounded-xl bg-slate-50/70 px-1 pt-2">
              <LineChart labels={chartData.labels} values={chartData.growth} format={(value) => `${value} client${value === 1 ? "" : "s"}`} />
            </div>
          </Card>
        </div>
      </section>

      <div className="grid gap-6 2xl:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Service desk</p>
            <h2 className="mt-1 font-semibold text-slate-900">Recent complaints</h2>
            <p className="mt-1 text-xs text-slate-500">The latest jobs that came in</p>
          </div>
          <Link href={ROUTES.clients} className="group inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50">
            View all <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <Table head={["Complaint No.", "Client", "Date", "Status", "Technician"]} loading={loading} empty={!periodComplaints.length} emptyText="No complaints in this date range.">
          {periodComplaints.slice(0, 6).map((complaint) => (
            <tr key={complaint.id} className="hover:bg-slate-50/80">
              <td>
                <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700">{complaint.complaint_no}</span>
              </td>
              <td>
                <p className="font-medium text-slate-900">{complaint.client_name}</p>
                <p className="text-xs text-slate-500">{complaint.phone}</p>
              </td>
              <td className="whitespace-nowrap text-slate-500">{formatDate(complaint.complaint_date)}</td>
              <td><Badge status={complaint.status} /></td>
              <td>{complaint.technician || <span className="text-slate-400">—</span>}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Shop counter</p>
            <h2 className="mt-1 font-semibold text-slate-900">Recent sales</h2>
            <p className="mt-1 text-xs text-slate-500">
              {stats.shopSalesCount} shop purchase{stats.shopSalesCount === 1 ? "" : "s"} ·{" "}
              {stats.techSalesCount} technician item{stats.techSalesCount === 1 ? "" : "s"}
            </p>
          </div>
          <Link href={ROUTES.purchases} className="group inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50">
            View all <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <Table head={["Sold to", "Product", "Date", "Amount"]} loading={loading} empty={!periodSales.length} emptyText="No sales in this date range.">
          {periodSales.slice(0, 6).map((sale) => (
            <tr key={sale.key} className="hover:bg-slate-50/80">
              <td>
                <p className="font-medium text-slate-900">{sale.who}</p>
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  {sale.kind === "technician" ? (
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700">Technician</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Shop</span>
                  )}
                  {sale.phone}
                </p>
              </td>
              <td>{sale.product}</td>
              <td className="whitespace-nowrap text-slate-500">{formatDate(sale.date)}</td>
              <td className="whitespace-nowrap">
                <p className="font-semibold text-slate-900">{formatMoney(sale.amount)}</p>
                {!sale.paid && <p className="text-xs font-medium text-amber-600">Pending</p>}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      </div>
    </>
  );
}
