"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Complaint, InvoiceStatus, InvoiceWithComplaint, ShopPurchase, WarrantyUnit } from "@/lib/types";
import { errorMessage, formatDate, formatMoney, formatWarranty, generateInvoiceNo, todayISO, warrantyEndDate } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import SearchSelect, { type SearchOption } from "@/components/ui/SearchSelect";
import { useToast } from "@/components/providers/ToastProvider";

type ComplaintOption = Pick<Complaint, "id" | "complaint_no" | "client_name" | "phone" | "advance_amount" | "defect">;
type ShopPurchaseOption = Pick<ShopPurchase, "id" | "customer_name" | "phone" | "product" | "amount" | "purchase_date">;

interface InvoiceFormModalProps {
  open: boolean;
  invoice: InvoiceWithComplaint | null; // null = new invoice
  onClose: () => void;
  onSaved: () => void;
}

export const INVOICE_SELECT = "*, complaint:complaints(complaint_no, complaint_date, client_name, phone, address, led_model, serial_number, technician, technician_phone, defect, condition, notes, advance_amount, payments:customer_payments(amount)), purchase:shop_purchases(customer_name, phone, address, product, purchase_date)";

export default function InvoiceFormModal({ open, invoice, onClose, onSaved }: InvoiceFormModalProps) {
  const toast = useToast();
  const [complaints, setComplaints] = useState<ComplaintOption[]>([]);
  const [purchases, setPurchases] = useState<ShopPurchaseOption[]>([]);
  const [source, setSource] = useState<"complaint" | "purchase">("complaint");
  const [complaintId, setComplaintId] = useState("");
  const [purchaseId, setPurchaseId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("paid");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [warrantyValue, setWarrantyValue] = useState("");
  const [warrantyUnit, setWarrantyUnit] = useState<WarrantyUnit>("months");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reset the form each time the modal opens */
    setSource(invoice?.purchase_id ? "purchase" : "complaint");
    setComplaintId(invoice?.complaint_id ?? "");
    setPurchaseId(invoice?.purchase_id ?? "");
    setDescription(invoice?.description ?? "");
    setAmount(invoice ? String(invoice.amount) : "");
    setPaidAmount(invoice?.paid_amount != null ? String(invoice.paid_amount) : "");
    setStatus(invoice?.status ?? "paid");
    setDate(invoice?.invoice_date ?? todayISO());
    setNotes(invoice?.notes ?? "");
    setWarrantyValue(invoice?.warranty_value ? String(invoice.warranty_value) : "");
    setWarrantyUnit(invoice?.warranty_unit ?? "months");
    /* eslint-enable react-hooks/set-state-in-effect */
    const supabase = createClient();
    Promise.all([
      supabase.from("complaints").select("id, complaint_no, client_name, phone, advance_amount, defect").order("created_at", { ascending: false }),
      supabase.from("shop_purchases").select("id, customer_name, phone, product, amount, purchase_date").order("purchase_date", { ascending: false }),
    ]).then(([complaintResult, purchaseResult]) => {
      if (complaintResult.error) toast(errorMessage(complaintResult.error), "error");
      else setComplaints((complaintResult.data as ComplaintOption[]) ?? []);
      if (purchaseResult.error) toast(errorMessage(purchaseResult.error), "error");
      else setPurchases((purchaseResult.data as ShopPurchaseOption[]) ?? []);
    });
  }, [open, invoice, toast]);

  const complaintOptions = useMemo<SearchOption[]>(
    () => complaints.map((c) => ({ id: c.id, label: `${c.complaint_no} · ${c.client_name}`, sublabel: c.phone })),
    [complaints],
  );
  const purchaseOptions = useMemo<SearchOption[]>(
    () =>
      purchases.map((p) => ({
        id: p.id,
        label: `${p.customer_name} · ${p.product}`,
        sublabel: `${p.phone} · ${p.purchase_date}`,
      })),
    [purchases],
  );

  function resolveInvoiceStatus(total: number, paid: number): InvoiceStatus {
    if (total <= 0) return "paid";
    if (paid >= total) return "paid";
    if (paid > 0) return "partial";
    return "pending";
  }

  function onPurchaseChange(value: string) {
    setPurchaseId(value);
    const selected = purchases.find((purchase) => purchase.id === value);
    if (selected) {
      const total = Number(selected.amount);
      setAmount(String(selected.amount));
      setPaidAmount("0");
      setDescription(selected.product);
      setStatus(resolveInvoiceStatus(total, 0));
    } else {
      setAmount("");
      setPaidAmount("");
      setStatus("pending");
    }
  }

  function onComplaintChange(value: string) {
    setComplaintId(value);
    const selected = complaints.find((complaint) => complaint.id === value);
    if (selected) {
      setDescription(selected.defect?.trim() || "");
    } else {
      setDescription("");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (source === "complaint" && !complaintId) {
      toast("Pick a complaint from the list", "error");
      return;
    }
    if (source === "purchase" && !purchaseId) {
      toast("Select a shop purchase", "error");
      return;
    }
    const warranty = warrantyValue.trim() ? Number(warrantyValue) : null;
    if (warranty !== null && (!Number.isInteger(warranty) || warranty < 1)) {
      toast("Warranty must be a whole number like 3, or leave it empty", "error");
      return;
    }
    const total = Number(amount) || 0;
    const paid = Math.max(0, Number(paidAmount) || 0);
    if (paid > total) {
      toast("Amount paid cannot be more than the total bill.", "error");
      return;
    }
    const resolvedStatus: InvoiceStatus = total <= 0 ? "paid" : paid >= total ? "paid" : paid > 0 ? "partial" : "pending";
    setSaving(true);
    const supabase = createClient();
    const payload = {
      complaint_id: source === "complaint" ? complaintId : null,
      purchase_id: source === "purchase" ? purchaseId : null,
      description,
      amount: total,
      paid_amount: paid,
      status: resolvedStatus,
      invoice_date: date,
      notes: notes.trim() || null,
      warranty_value: warranty,
      warranty_unit: warranty ? warrantyUnit : null,
    };
    const { error } = invoice
      ? await supabase.from("invoices").update(payload).eq("id", invoice.id)
      : await supabase.from("invoices").insert({ ...payload, invoice_no: generateInvoiceNo() });
    if (error) {
      setSaving(false);
      return toast(errorMessage(error), "error");
    }

    // Billing a complaint means work has started: a pending complaint moves to "In Progress".
    // (One that is already in progress or resolved is left as it is.)
    let movedToInProgress = false;
    if (payload.complaint_id) {
      const { data: moved, error: statusError } = await supabase
        .from("complaints")
        .update({ status: "in_progress" })
        .eq("id", payload.complaint_id)
        .eq("status", "pending")
        .select("id");
      if (statusError) toast(`Invoice saved, but the complaint status could not be updated: ${errorMessage(statusError)}`, "error");
      movedToInProgress = Boolean(moved?.length);
    }
    setSaving(false);
    toast(`${invoice ? "Invoice updated" : "Invoice added"}${movedToInProgress ? " · complaint marked In Progress" : ""}`);
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={invoice ? `Edit Invoice ${invoice.invoice_no}` : "Add Invoice"} size="lg">
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Invoices are made for complaints. Only older invoices made for a shop purchase show the purchase picker. */}
        {source === "complaint" ? (
          <div className="space-y-1.5">
            <SearchSelect
              label="Complaint"
              required
              options={complaintOptions}
              value={complaintId}
              onChange={onComplaintChange}
              placeholder="Select a complaint"
              searchPlaceholder="Search complaint no., name or phone..."
              emptyText="No complaint matches your search."
            />
            {(() => {
              const advance = Number(complaints.find((c) => c.id === complaintId)?.advance_amount ?? 0);
              if (advance <= 0) return null;
              const due = Math.max(Number(amount || 0) - advance, 0);
              return (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Customer paid <b>{formatMoney(advance)}</b> in advance.
                  {amount ? <> Balance due: <b>{formatMoney(due)}</b>.</> : null}
                </p>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-1.5">
            <SearchSelect
              label="Shop purchase / customer"
              required
              options={purchaseOptions}
              value={purchaseId}
              onChange={onPurchaseChange}
              placeholder="Select a customer purchase"
              searchPlaceholder="Search customer, product or phone..."
              emptyText={purchases.length ? "No purchase matches your search." : "Record a shop purchase first."}
            />
            {purchaseId && <p className="text-xs text-slate-500">The purchase amount is filled in automatically.</p>}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Field label="Description" required>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
          </Field>
          <Field label="Total Bill" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => {
                const nextTotal = Number(e.target.value) || 0;
                setAmount(e.target.value);
                setStatus(resolveInvoiceStatus(nextTotal, Number(paidAmount) || 0));
              }}
              readOnly={source === "purchase" && Boolean(purchaseId)}
              required
              placeholder="0"
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount Paid">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={paidAmount}
              onChange={(e) => {
                const nextPaid = Number(e.target.value) || 0;
                setPaidAmount(e.target.value);
                setStatus(resolveInvoiceStatus(Number(amount) || 0, nextPaid));
              }}
              placeholder="0"
            />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}>
              <option value="paid">Paid</option>
              <option value="partial">Partial paid</option>
              <option value="pending">Pending</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-1">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Warranty (Optional)">
              <Input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={warrantyValue}
                onChange={(e) => setWarrantyValue(e.target.value)}
                placeholder="e.g. 3"
              />
            </Field>
            <Field label="Period">
              <Select value={warrantyUnit} onChange={(e) => setWarrantyUnit(e.target.value as WarrantyUnit)} aria-label="Warranty period">
                <option value="days">Days</option>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </Select>
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            {formatWarranty(Number(warrantyValue) || null, warrantyUnit)
              ? `${formatWarranty(Number(warrantyValue), warrantyUnit)} warranty · valid until ${formatDate(warrantyEndDate(date, Number(warrantyValue), warrantyUnit))}`
              : "Leave empty if there is no warranty. It prints on the bill as \"Product Warranty\"."}
          </p>
        </div>
        <Field label="Note (Optional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Write a note for this invoice..." className="min-h-14" rows={2} />
        </Field>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {invoice ? "Update" : "Save Invoice"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
