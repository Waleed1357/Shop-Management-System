"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleCheck, Clock, Eye, FileDown, Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { VendorPayment } from "@/lib/types";
import { errorMessage, formatDate, formatMoney, todayISO } from "@/lib/utils";
import { Card, IconButton, PageHeader, Table } from "@/components/ui/Card";
import SearchBar from "@/components/ui/SearchBar";
import Button from "@/components/ui/Button";
import MetricCard from "@/components/ui/MetricCard";
import Modal from "@/components/ui/Modal";
import DetailsModal from "@/components/ui/DetailsModal";
import ExportRangeModal, { inExportRange, type ExportRange } from "@/components/ui/ExportRangeModal";
import { downloadTablePdf } from "@/lib/pdf";
import { useSettings } from "@/components/providers/SettingsProvider";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/providers/ToastProvider";

type VendorForm = { name: string; date: string; paid: string; pending: string; notes: string };

export default function VendorPaymentsList() {
  const toast = useToast();
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorPayment | null>(null);
  const [viewing, setViewing] = useState<VendorPayment | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { settings } = useSettings();
  const [form, setForm] = useState<VendorForm>({ name: "", date: "", paid: "", pending: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("vendor_payments")
      .select("*")
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      const message = errorMessage(error);
      setLoadError(message);
      toast(message, "error");
    } else {
      setPayments((data as VendorPayment[]) ?? []);
      setLoadError("");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading remote data on mount
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return payments;
    return payments.filter((payment) =>
      [payment.vendor_name, payment.notes, payment.payment_date].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [payments, search]);

  /** Vendor names already used, so the same vendor is typed the same way each time. */
  const vendorNames = useMemo(
    () => [...new Set(payments.map((payment) => payment.vendor_name.trim()))].sort((a, b) => a.localeCompare(b)),
    [payments],
  );

  const totals = useMemo(() => ({
    paid: filtered.reduce((total, payment) => total + Number(payment.amount_paid), 0),
    pending: filtered.reduce((total, payment) => total + Number(payment.amount_pending), 0),
  }), [filtered]);

  function openForm(payment?: VendorPayment) {
    setEditing(payment ?? null);
    setForm({
      name: payment?.vendor_name ?? "",
      date: payment?.payment_date ?? todayISO(),
      paid: payment ? String(payment.amount_paid) : "",
      pending: payment ? String(payment.amount_pending) : "",
      notes: payment?.notes ?? "",
    });
    setFormOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    const paid = Number(form.paid || 0);
    const pending = Number(form.pending || 0);
    if (!name) {
      toast("Enter the vendor name", "error");
      return;
    }
    if (!Number.isFinite(paid) || !Number.isFinite(pending) || paid < 0 || pending < 0) {
      toast("Amounts can't be negative", "error");
      return;
    }
    if (paid === 0 && pending === 0) {
      toast("Enter the amount paid or the amount pending", "error");
      return;
    }

    setSaving(true);
    const payload = {
      vendor_name: name,
      payment_date: form.date,
      amount_paid: paid,
      amount_pending: pending,
      notes: form.notes.trim() || null,
    };
    const supabase = createClient();
    const { error } = editing
      ? await supabase.from("vendor_payments").update(payload).eq("id", editing.id)
      : await supabase.from("vendor_payments").insert(payload);
    setSaving(false);
    if (error) {
      toast(errorMessage(error), "error");
      return;
    }
    toast(editing ? "Vendor payment updated" : "Vendor payment added");
    setFormOpen(false);
    load();
  }

  function exportPayments(range: ExportRange) {
    const rows = filtered.filter((payment) => inExportRange(payment.payment_date, range));
    if (!rows.length) {
      toast("No vendor payments in that period.", "error");
      return;
    }
    const paid = rows.reduce((sum, payment) => sum + Number(payment.amount_paid), 0);
    const pending = rows.reduce((sum, payment) => sum + Number(payment.amount_pending), 0);
    downloadTablePdf(
      "Vendor Payments",
      ["Vendor", "Date", "Amount paid", "Amount pending", "Note"],
      [
        ...rows.map((payment) => [
          payment.vendor_name,
          formatDate(payment.payment_date),
          formatMoney(payment.amount_paid),
          formatMoney(payment.amount_pending),
          payment.notes || "-",
        ]),
        ["TOTAL", "", formatMoney(paid), formatMoney(pending), ""],
      ],
      { businessName: settings.business_name, logoUrl: settings.logo_url },
      range.label,
    );
  }

  return (
    <>
      <PageHeader
        title="Vendor Payments"
        subtitle="Money paid to vendors and what is still pending"
        action={
          <>
            <Button variant="secondary" disabled={!filtered.length} onClick={() => setExportOpen(true)}>
              <FileDown className="size-4" /> Export PDF
            </Button>
            <Button onClick={() => openForm()}>
              <Plus className="size-4" /> Add Vendor Payment
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <MetricCard
          icon={<CircleCheck className="size-5" />}
          tone="bg-emerald-50 text-emerald-600"
          label={search ? "Paid (shown)" : "Total paid"}
          value={formatMoney(totals.paid)}
          loading={loading}
        />
        <MetricCard
          icon={<Clock className="size-5" />}
          tone="bg-amber-50 text-amber-600"
          label={search ? "Pending (shown)" : "Total pending"}
          value={formatMoney(totals.pending)}
          loading={loading}
        />
      </div>

      <Card>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by vendor name, note or date..." className="mb-4" />
        <div className="clients-table-scroll h-[min(60vh,600px)] overflow-auto rounded-xl border border-slate-100">
          <Table
            loading={loading}
            head={["Vendor", "Date", "Amount paid", "Amount pending", "Note", "Actions"]}
            empty={!filtered.length}
            emptyText={loadError
              ? `Could not load vendor payments: ${loadError}`
              : search
                ? "No vendor payments match your search."
                : "No vendor payments have been added yet."}
          >
            {filtered.map((payment) => (
              <tr key={payment.id} className="hover:bg-slate-50">
                <td className="px-3 py-3 font-medium">{payment.vendor_name}</td>
                <td className="px-3 py-3">{formatDate(payment.payment_date)}</td>
                <td className="px-3 py-3 font-medium text-emerald-700">{formatMoney(payment.amount_paid)}</td>
                <td className="px-3 py-3 font-medium text-red-700">{formatMoney(payment.amount_pending)}</td>
                <td className="px-3 py-3 text-slate-600">{payment.notes || "-"}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <IconButton label="View vendor payment" onClick={() => setViewing(payment)}>
                      <Eye className="size-4" />
                    </IconButton>
                    <IconButton label="Edit vendor payment" onClick={() => openForm(payment)}>
                      <Pencil className="size-4" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>

      <ExportRangeModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={exportPayments} title="Export vendor payments" />

      <DetailsModal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.vendor_name ?? "Vendor payment"}
        subtitle="Vendor payment details"
        rows={viewing ? [
          { label: "Vendor", value: viewing.vendor_name },
          { label: "Date", value: formatDate(viewing.payment_date) },
          { label: "Amount paid", value: <span className="text-emerald-700">{formatMoney(viewing.amount_paid)}</span> },
          { label: "Amount pending", value: <span className="text-red-700">{formatMoney(viewing.amount_pending)}</span> },
          { label: "Note", value: viewing.notes, wide: true },
        ] : []}
      />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit Vendor Payment" : "Add Vendor Payment"}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Vendor name" required>
            <Input
              autoFocus
              list="vendor-names"
              autoComplete="off"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              placeholder="Enter vendor name"
            />
          </Field>
          <datalist id="vendor-names">
            {vendorNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Field label="Date" required>
            <Input
              type="date"
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount paid">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.paid}
                onChange={(event) => setForm((current) => ({ ...current, paid: event.target.value }))}
                placeholder="0"
              />
            </Field>
            <Field label="Amount pending">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.pending}
                onChange={(event) => setForm((current) => ({ ...current, pending: event.target.value }))}
                placeholder="0"
              />
            </Field>
          </div>
          <Field label="Note (Optional)">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="e.g. bill number or items bought"
              className="min-h-20"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Update" : "Save Payment"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
