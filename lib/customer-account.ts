/**
 * A customer's account across all their visits.
 *
 * - A customer is everyone with the same phone number (dashes, spaces and +92 are ignored).
 * - Each complaint is one LED. Its bill is the total of its invoices.
 * - Paid for an LED = advance at registration + every later payment
 *   (or the full bill if its invoice was marked Paid by hand).
 * - Due = bill - paid. An LED with no invoice yet has no bill, so nothing is due yet.
 */
import { createClient } from "@/lib/supabase/client";
import type { Complaint, CustomerPayment, Invoice } from "@/lib/types";

/** "0300-1234567", "+92 300 1234567" and "923001234567" all become "3001234567". */
export function phoneKey(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.slice(-10);
}

export type AccountInvoice = Pick<Invoice, "id" | "invoice_no" | "complaint_id" | "amount" | "status" | "invoice_date">;

export interface AccountLed {
  complaint: Complaint;
  invoices: AccountInvoice[];
  payments: CustomerPayment[];
  /** Total of this LED's invoices, or null when it hasn't been billed yet. */
  billed: number | null;
  paid: number;
  due: number;
}

/** One line in the payment history (advance or a later payment). */
export interface AccountPayment {
  key: string;
  date: string;
  amount: number;
  complaint: Complaint;
  kind: "advance" | "payment";
  notes: string | null;
}

export interface CustomerAccount {
  name: string;
  phone: string;
  leds: AccountLed[];
  history: AccountPayment[];
  totals: { billed: number; paid: number; due: number; visits: number };
}

const sum = (values: number[]) => values.reduce((total, v) => total + Number(v), 0);

export function summarizeLed(complaint: Complaint, invoices: AccountInvoice[], payments: CustomerPayment[]): AccountLed {
  const billed = invoices.length ? sum(invoices.map((i) => i.amount)) : null;
  const received = Number(complaint.advance_amount ?? 0) + sum(payments.map((p) => p.amount));
  const allMarkedPaid = invoices.length > 0 && invoices.every((i) => i.status === "paid");
  const paid = billed === null ? received : allMarkedPaid ? billed : Math.min(received, billed);
  return { complaint, invoices, payments, billed, paid, due: billed === null ? 0 : Math.max(billed - paid, 0) };
}

/** Loads every complaint, invoice and payment for the customer with this phone number. */
export async function loadCustomerAccount(phone: string): Promise<CustomerAccount | null> {
  const key = phoneKey(phone);
  if (key.length < 7) return null;
  const supabase = createClient();

  // Phones are stored as typed, so match on the digits.
  const { data: all, error } = await supabase.from("complaints").select("id, phone");
  if (error) throw error;
  const ids = (all ?? []).filter((c) => phoneKey(c.phone) === key).map((c) => c.id as string);
  if (!ids.length) return null;

  const [complaints, invoices, payments] = await Promise.all([
    supabase.from("complaints").select("*").in("id", ids).order("complaint_date").order("created_at"),
    supabase.from("invoices").select("id, invoice_no, complaint_id, amount, status, invoice_date").in("complaint_id", ids),
    supabase.from("customer_payments").select("*").in("complaint_id", ids).order("payment_date").order("created_at"),
  ]);
  const failed = complaints.error ?? invoices.error ?? payments.error;
  if (failed) throw failed;

  const rows = (complaints.data as Complaint[]) ?? [];
  const invoiceRows = (invoices.data as AccountInvoice[]) ?? [];
  const paymentRows = (payments.data as CustomerPayment[]) ?? [];

  const leds = rows.map((c) =>
    summarizeLed(
      c,
      invoiceRows.filter((i) => i.complaint_id === c.id),
      paymentRows.filter((p) => p.complaint_id === c.id),
    ),
  );

  const history: AccountPayment[] = [
    ...rows
      .filter((c) => Number(c.advance_amount) > 0)
      .map((c) => ({
        key: `a-${c.id}`,
        date: c.complaint_date,
        amount: Number(c.advance_amount),
        complaint: c,
        kind: "advance" as const,
        notes: "Advance when the LED was brought in",
      })),
    ...paymentRows.map((p) => ({
      key: `p-${p.id}`,
      date: p.payment_date,
      amount: Number(p.amount),
      complaint: rows.find((c) => c.id === p.complaint_id)!,
      kind: "payment" as const,
      notes: p.notes,
    })),
  ]
    .filter((h) => h.complaint)
    .sort((a, b) => b.date.localeCompare(a.date));

  const latest = rows[rows.length - 1];
  return {
    name: latest?.client_name ?? "",
    phone: latest?.phone ?? phone,
    leds,
    history,
    totals: {
      billed: sum(leds.map((l) => l.billed ?? 0)),
      paid: sum(leds.map((l) => l.paid)),
      due: sum(leds.map((l) => l.due)),
      visits: new Set(rows.map((c) => c.complaint_date)).size,
    },
  };
}

/**
 * Records a payment for one LED. When it clears the bill, that LED's pending invoices are marked Paid
 * so the Invoices page and revenue show it as paid.
 */
export async function recordCustomerPayment(led: AccountLed, amount: number, date: string, notes: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("customer_payments")
    .insert({ complaint_id: led.complaint.id, amount, payment_date: date, notes });
  if (error) throw error;

  if (led.billed !== null && led.paid + amount >= led.billed) {
    const pending = led.invoices.filter((i) => i.status !== "paid").map((i) => i.id);
    if (pending.length) {
      const { error: invoiceError } = await supabase.from("invoices").update({ status: "paid" }).in("id", pending);
      if (invoiceError) throw invoiceError;
    }
  }
}
