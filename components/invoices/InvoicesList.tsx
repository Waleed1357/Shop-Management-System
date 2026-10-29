"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, Eye, FileDown, LoaderCircle, Pencil, Plus, Printer, ShoppingBag, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { InvoiceWithComplaint } from "@/lib/types";
import { downloadInvoicePdf, downloadTablePdf, printInvoicePdf } from "@/lib/pdf";
import { errorMessage, formatDate, formatMoney, formatWarranty, warrantyEndDate } from "@/lib/utils";
import { computeRevenue, type RevenueShopSale, type RevenueTechItem } from "@/lib/revenue";
import { Card, IconButton, PageHeader, Table } from "@/components/ui/Card";
import SearchBar from "@/components/ui/SearchBar";
import Badge from "@/components/ui/Badge";
import DetailsModal from "@/components/ui/DetailsModal";
import ExportRangeModal, { inExportRange, type ExportRange } from "@/components/ui/ExportRangeModal";
import MetricCard from "@/components/ui/MetricCard";
import Button from "@/components/ui/Button";
import { PAGE_SIZE } from "@/components/ui/Pagination";
import { useSettings } from "@/components/providers/SettingsProvider";
import { useToast } from "@/components/providers/ToastProvider";
import InvoiceFormModal, { INVOICE_SELECT } from "./InvoiceFormModal";

export default function InvoicesList() {
  const toast = useToast();
  const { settings } = useSettings();
  const branding = { businessName: settings.business_name, logoUrl: settings.logo_url };

  const [rows, setRows] = useState<InvoiceWithComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, startLoadingMore] = useTransition();
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceWithComplaint | null>(null);
  const [viewing, setViewing] = useState<InvoiceWithComplaint | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [shopSales, setShopSales] = useState<RevenueShopSale[]>([]);
  const [techItems, setTechItems] = useState<RevenueTechItem[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [inv, shop, tech] = await Promise.all([
      supabase.from("invoices").select(INVOICE_SELECT).order("created_at", { ascending: false }),
      supabase.from("shop_purchases").select("id, amount, purchase_date"),
      supabase.from("technician_purchases").select("total_amount, payment_status, paid_amount, purchase_date"),
    ]);
    const error = inv.error ?? shop.error ?? tech.error;
    if (error) toast(errorMessage(error), "error");
    setRows((inv.data as InvoiceWithComplaint[]) ?? []);
    setShopSales((shop.data as RevenueShopSale[]) ?? []);
    setTechItems((tech.data as RevenueTechItem[]) ?? []);
    setLoading(false);
  }, [toast]);

  // Same totals as the dashboard used to show (all time)
  const money = useMemo(() => computeRevenue(rows, shopSales, techItems), [rows, shopSales, techItems]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading remote data on mount
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.invoice_no,
        r.complaint?.complaint_no,
        r.complaint?.client_name,
        r.complaint?.phone,
        r.purchase?.customer_name,
        r.purchase?.phone,
        r.purchase?.product,
      ].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || visibleCount >= filtered.length) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startLoadingMore(() => {
            setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length));
          });
        }
      },
      { root: tableScrollRef.current, rootMargin: "0px 0px 200px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount, startLoadingMore]);

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.amount), 0);
    const pending = rows.filter((r) => r.status === "pending").reduce((s, r) => s + Number(r.amount), 0);
    return { paid, pending };
  }, [rows]);

  function exportInvoices(range: ExportRange) {
    const rows = filtered.filter((r) => inExportRange(r.invoice_date, range));
    if (!rows.length) {
      toast("No invoices in that period.", "error");
      return;
    }
    downloadTablePdf(
      "Invoices",
      ["Invoice No.", "Complaint / Product", "Customer", "Phone", "Amount", "Status", "Date"],
      rows.map((r) => [
        r.invoice_no,
        r.complaint?.complaint_no ?? r.purchase?.product ?? "-",
        r.complaint?.client_name ?? r.purchase?.customer_name ?? "-",
        r.complaint?.phone ?? r.purchase?.phone ?? "-",
        formatMoney(r.amount),
        r.status,
        formatDate(r.invoice_date),
      ]),
      branding,
      range.label,
    );
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={`Received ${formatMoney(totals.paid)} · Pending ${formatMoney(totals.pending)}`}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Add Invoice
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <MetricCard icon={<Wallet className="size-5" />} tone="bg-emerald-50 text-emerald-600" label="Total revenue" value={formatMoney(money.revenue)} loading={loading} />
        <MetricCard icon={<ShoppingBag className="size-5" />} tone="bg-rose-50 text-rose-600" label="Total sales" value={formatMoney(money.salesTotal)} loading={loading} />
      </div>
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Search by complaint, customer, product or phone..."
            className="flex-1"
          />
          <Button variant="secondary" disabled={!filtered.length} onClick={() => setExportOpen(true)}>
            <FileDown className="size-4" /> Export PDF
          </Button>
        </div>

        <div
          ref={tableScrollRef}
          className="clients-table-scroll h-[min(60vh,600px)] overflow-auto rounded-xl border border-slate-100"
        >
          <Table loading={loading} head={["#", "Invoice No.", "Complaint / Product", "Customer", "Amount", "Status", "Date", "Actions"]} empty={!filtered.length}>
            {filtered.slice(0, visibleCount).map((r, i) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                <td className="px-3 py-3 font-medium">{r.invoice_no}</td>
                <td className="px-3 py-3">{r.complaint?.complaint_no ?? r.purchase?.product ?? "-"}</td>
                <td className="px-3 py-3">{r.complaint?.client_name ?? r.purchase?.customer_name ?? "-"}</td>
                <td className="px-3 py-3 font-medium">{formatMoney(r.amount)}</td>
                <td className="px-3 py-3"><Badge status={r.status} /></td>
                <td className="px-3 py-3">{formatDate(r.invoice_date)}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <IconButton label="View invoice" onClick={() => setViewing(r)}>
                      <Eye className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Print invoice"
                      variant="info"
                      onClick={() =>
                        printInvoicePdf(r, branding).catch((error: unknown) =>
                          toast(errorMessage(error), "error"),
                        )
                      }
                    >
                      <Printer className="size-4" />
                    </IconButton>
                    <IconButton label="Download PDF" variant="info" onClick={() => downloadInvoicePdf(r, branding)}>
                      <Download className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Edit"
                      onClick={() => {
                        setEditing(r);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {!loading && visibleCount < filtered.length && (
            <div
              ref={loadMoreRef}
              className="flex h-10 items-center justify-center"
              aria-label="Loading more invoices as you scroll"
            >
              {isLoadingMore && (
                <LoaderCircle
                  className="size-5 animate-spin text-red-600"
                  role="status"
                  aria-label="Loading more invoices"
                />
              )}
            </div>
          )}
        </div>
      </Card>

      <ExportRangeModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={exportInvoices} title="Export invoices" />

      <DetailsModal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing ? `Invoice ${viewing.invoice_no}` : "Invoice"}
        subtitle={viewing?.complaint?.client_name ?? viewing?.purchase?.customer_name}
        rows={viewing ? [
          { label: "Invoice No.", value: viewing.invoice_no },
          { label: "Status", value: <Badge status={viewing.status} /> },
          { label: "Customer", value: viewing.complaint?.client_name ?? viewing.purchase?.customer_name },
          { label: "Phone Number", value: viewing.complaint?.phone ?? viewing.purchase?.phone },
          viewing.complaint
            ? { label: "Complaint No.", value: viewing.complaint.complaint_no }
            : { label: "Product", value: viewing.purchase?.product },
          { label: "LED Model", value: viewing.complaint?.led_model },
          { label: "Description", value: viewing.description },
          { label: "Amount", value: formatMoney(viewing.amount) },
          ...(Number(viewing.complaint?.advance_amount) > 0
            ? [{ label: "Advance paid", value: formatMoney(viewing.complaint?.advance_amount) }]
            : []),
          ...(viewing.complaint?.payments?.length
            ? [{
                label: "Paid later",
                value: formatMoney(viewing.complaint.payments.reduce((total, p) => total + Number(p.amount), 0)),
              }]
            : []),
          { label: "Date", value: formatDate(viewing.invoice_date) },
          {
            label: "Warranty",
            value: formatWarranty(viewing.warranty_value, viewing.warranty_unit)
              ? `${formatWarranty(viewing.warranty_value, viewing.warranty_unit)} · until ${formatDate(warrantyEndDate(viewing.invoice_date, viewing.warranty_value, viewing.warranty_unit))}`
              : "No warranty",
          },
          { label: "Address", value: viewing.complaint?.address ?? viewing.purchase?.address, wide: true },
          { label: "Note", value: viewing.notes, wide: true },
        ] : []}
      />

      <InvoiceFormModal
        open={formOpen}
        invoice={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          setVisibleCount(PAGE_SIZE);
          load();
        }}
      />
    </>
  );
}
