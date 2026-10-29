"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { Check, Eye, LoaderCircle, Minus, Pencil, Plus, Search, UserCheck, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Technician, TechnicianPurchase, TechnicianPurchasePaymentStatus } from "@/lib/types";
import { techDueAmount, techPaidAmount } from "@/lib/revenue";
import { cn, errorMessage, formatDate, formatMoney } from "@/lib/utils";
import { Card, IconButton, PageHeader, Table } from "@/components/ui/Card";
import SearchBar from "@/components/ui/SearchBar";
import Button from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import { PAGE_SIZE } from "@/components/ui/Pagination";
import { useToast } from "@/components/providers/ToastProvider";

type TechnicianForm = { name: string; phone: string };
const EMPTY_FORM: TechnicianForm = { name: "", phone: "" };
type ItemDraft = {
  id: number;
  /** Name typed for the item (items are typed by hand; inventory stock is not changed). */
  customName: string;
  quantity: string;
  unitPrice: string;
  paymentStatus: TechnicianPurchasePaymentStatus;
  /** Amount paid now, when the status is "partial". */
  paidAmount: string;
};

const STATUS_LABEL: Record<TechnicianPurchasePaymentStatus, string> = {
  paid: "Paid",
  partial: "Part paid",
  pending: "Pending",
};

/** Problem with a row's part payment, or "" when it's fine. */
function partialPaymentError(draft: ItemDraft) {
  if (draft.paymentStatus !== "partial") return "";
  const paid = Number(draft.paidAmount);
  const total = Number(draft.quantity) * Number(draft.unitPrice);
  if (!draft.paidAmount.trim() || !Number.isFinite(paid) || paid <= 0) return "Enter how much was paid for each part-paid item.";
  if (paid >= total) return "The part payment must be less than the item total. Choose \"Paid\" if it's fully paid.";
  return "";
}

export default function TechnicianCredits() {
  const toast = useToast();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [purchases, setPurchases] = useState<TechnicianPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, startLoadingMore] = useTransition();
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [form, setForm] = useState<TechnicianForm>(EMPTY_FORM);
  const [itemDrafts, setItemDrafts] = useState<ItemDraft[]>([]);
  const nextItemId = useRef(0);
  const [saving, setSaving] = useState(false);
  /** Set when "Add Technician" is used for someone who already exists. */
  const [existingId, setExistingId] = useState<string | null>(null);
  const [nameListOpen, setNameListOpen] = useState(false);
  const [viewingItems, setViewingItems] = useState<Technician | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [paymentInputs, setPaymentInputs] = useState<Record<string, string>>({});
  const [returningPurchaseId, setReturningPurchaseId] = useState<string | null>(null);
  const [updatingPaymentPurchaseId, setUpdatingPaymentPurchaseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [technicianResult, purchaseResult] = await Promise.all([
      supabase.from("technicians").select("*").order("name"),
      supabase.from("technician_purchases").select("*").order("purchase_date", { ascending: false }),
    ]);
    if (technicianResult.error) {
      toast(errorMessage(technicianResult.error), "error");
    } else {
      setTechnicians((technicianResult.data as Technician[]) ?? []);
    }
    if (purchaseResult.error) {
      toast(errorMessage(purchaseResult.error), "error");
    } else {
      setPurchases((purchaseResult.data as TechnicianPurchase[]) ?? []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading remote data on mount
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return technicians;
    return technicians.filter((technician) =>
      [technician.name, technician.phone].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [technicians, search]);

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

  function openForm(technician?: Technician) {
    setEditing(technician ?? null);
    setForm(technician
      ? { name: technician.name, phone: technician.phone ?? "" }
      : EMPTY_FORM);
    setItemDrafts([]);
    setExistingId(null);
    setNameListOpen(false);
    setFormOpen(true);
  }

  // ---- "Add Technician": pick an existing technician or add a new one ----
  const existingTechnician = technicians.find((t) => t.id === existingId) ?? null;
  const nameMatches = useMemo(() => {
    const query = form.name.trim().toLowerCase();
    const digits = query.replace(/\D/g, "");
    if (!query) return technicians;
    return technicians.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        (digits.length >= 3 && (t.phone ?? "").replace(/\D/g, "").includes(digits)),
    );
  }, [technicians, form.name]);
  const exactMatch = technicians.find((t) => t.name.trim().toLowerCase() === form.name.trim().toLowerCase());

  function chooseTechnician(technician: Technician) {
    setExistingId(technician.id);
    setForm({ name: technician.name, phone: technician.phone ?? "" });
    setNameListOpen(false);
  }

  function onNameChange(name: string) {
    setForm((current) => ({ ...current, name }));
    setNameListOpen(true);
    // Typing the exact name of an existing technician links to them (no duplicates).
    const match = technicians.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (match) {
      setExistingId(match.id);
      setForm({ name, phone: match.phone ?? "" });
    } else if (existingId) {
      setExistingId(null);
      setForm({ name, phone: "" });
    }
  }

  async function saveTechnician(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
    };
    const supabase = createClient();
    const hasItems = itemDrafts.length > 0;
    if (!editing && hasItems && itemDrafts.some((item) =>
      !item.customName.trim()
      || !Number.isInteger(Number(item.quantity))
      || Number(item.quantity) < 1
      || !item.unitPrice.trim()
      || !Number.isFinite(Number(item.unitPrice))
      || Number(item.unitPrice) < 0,
    )) {
      toast("Type an item name, quantity, and selling price for each row, or remove the empty row.", "error");
      return;
    }
    const paymentProblem = editing ? "" : itemDrafts.map(partialPaymentError).find(Boolean);
    if (paymentProblem) {
      toast(paymentProblem, "error");
      return;
    }

    // Existing technician picked: update their phone if it changed, and add the items to their account.
    if (!editing && existingTechnician) {
      const phoneChanged = (payload.phone ?? "") !== (existingTechnician.phone ?? "");
      if (!hasItems && !phoneChanged) {
        toast(`${existingTechnician.name} already exists. Add the items they took, or change the phone number.`, "error");
        return;
      }

      setSaving(true);
      if (phoneChanged) {
        const { error } = await supabase.from("technicians").update({ phone: payload.phone }).eq("id", existingTechnician.id);
        if (error) {
          setSaving(false);
          toast(errorMessage(error), "error");
          return;
        }
      }
      if (hasItems) {
        // One insert = all items saved together.
        const { error } = await supabase.from("technician_purchases").insert(
          itemDrafts.map((draft) => ({
            technician_id: existingTechnician.id,
            item_id: null,
            item_name: draft.customName.trim(),
            quantity: Number(draft.quantity),
            unit_price: Number(draft.unitPrice),
            payment_status: draft.paymentStatus,
            paid_amount: draft.paymentStatus === "partial" ? Number(draft.paidAmount) : 0,
          })),
        );
        if (error) {
          setSaving(false);
          toast(errorMessage(error), "error");
          return;
        }
      }
      setSaving(false);
      toast(hasItems ? `Items added to ${existingTechnician.name}` : `${existingTechnician.name}'s phone updated`);
      setFormOpen(false);
      setVisibleCount(PAGE_SIZE);
      await load();
      return;
    }

    setSaving(true);
    const { error } = editing
      ? await supabase.from("technicians").update(payload).eq("id", editing.id)
      : await supabase.rpc("save_technician_with_items", {
          p_technician: payload,
          p_items: itemDrafts.map((item) => ({
            item_id: null,
            item_name: item.customName.trim(),
            quantity: Number(item.quantity),
            unit_price: Number(item.unitPrice),
            payment_status: item.paymentStatus,
            paid_amount: item.paymentStatus === "partial" ? Number(item.paidAmount) : 0,
          })),
        });
    setSaving(false);

    if (error) {
      toast(errorMessage(error), "error");
      return;
    }

    toast(editing ? "Technician updated" : hasItems ? "Technician and items added" : "Technician added");
    setFormOpen(false);
    setVisibleCount(PAGE_SIZE);
    await load();
  }

  async function returnPurchaseItem(purchase: TechnicianPurchase) {
    const quantity = Number(returnQuantities[purchase.id]);
    const remainingQuantity = purchase.quantity - purchase.returned_quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > remainingQuantity) {
      toast(`Enter a return quantity between 1 and ${remainingQuantity}.`, "error");
      return;
    }
    // A part-paid item can't be returned below what was already paid for it.
    const newTotal = (remainingQuantity - quantity) * Number(purchase.unit_price);
    if (techPaidAmount(purchase) > newTotal) {
      toast(`${formatMoney(techPaidAmount(purchase))} is already paid for this item, so it can't be returned that much.`, "error");
      return;
    }

    setReturningPurchaseId(purchase.id);
    const { data, error } = await createClient()
      .from("technician_purchases")
      .update({
        returned_quantity: purchase.returned_quantity + quantity,
        returned_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", purchase.id)
      .select("*")
      .single();
    setReturningPurchaseId(null);

    if (error) {
      toast(errorMessage(error), "error");
      return;
    }

    setPurchases((current) => current.map((item) =>
      item.id === purchase.id ? data as TechnicianPurchase : item,
    ));
    setReturnQuantities((current) => ({ ...current, [purchase.id]: "" }));
    toast(`${quantity} ${quantity === 1 ? "item" : "items"} returned to inventory`);
  }

  async function updatePayment(
    purchase: TechnicianPurchase,
    changes: Pick<TechnicianPurchase, "payment_status" | "paid_amount">,
    message: string,
  ) {
    setUpdatingPaymentPurchaseId(purchase.id);
    const { data, error } = await createClient()
      .from("technician_purchases")
      .update(changes)
      .eq("id", purchase.id)
      .select("*")
      .single();
    setUpdatingPaymentPurchaseId(null);

    if (error) {
      toast(errorMessage(error), "error");
      return;
    }

    setPurchases((current) => current.map((item) =>
      item.id === purchase.id ? data as TechnicianPurchase : item,
    ));
    setPaymentInputs((current) => ({ ...current, [purchase.id]: "" }));
    toast(message);
  }

  /** Adds a payment (full or part) to what the technician has already paid for this item. */
  function receivePayment(purchase: TechnicianPurchase) {
    const amount = Number(paymentInputs[purchase.id]);
    const due = techDueAmount(purchase);
    if (!Number.isFinite(amount) || amount <= 0 || amount > due) {
      toast(`Enter an amount between 1 and ${formatMoney(due)}.`, "error");
      return;
    }
    const paid = techPaidAmount(purchase) + amount;
    if (paid >= Number(purchase.total_amount)) {
      updatePayment(purchase, { payment_status: "paid", paid_amount: Number(purchase.total_amount) }, "Item fully paid");
    } else {
      updatePayment(purchase, { payment_status: "partial", paid_amount: paid }, `${formatMoney(amount)} received. ${formatMoney(Number(purchase.total_amount) - paid)} still due.`);
    }
  }

  function togglePurchasePaymentStatus(purchase: TechnicianPurchase) {
    if (purchase.payment_status === "paid") {
      updatePayment(purchase, { payment_status: "pending", paid_amount: 0 }, "Item marked as pending");
    } else {
      updatePayment(purchase, { payment_status: "paid", paid_amount: Number(purchase.total_amount) }, "Item marked as paid");
    }
  }

  return (
    <>
      <PageHeader
        title="Technicians"
        subtitle="Manage your technicians"
        action={
          <Button onClick={() => openForm()}>
            <Plus className="size-4" /> Add Technician
          </Button>
        }
      />

      <Card>
        <SearchBar
          value={search}
          onChange={(value) => {
            setSearch(value);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Search by technician name or phone..."
          className="mb-4"
        />

        <div
          ref={tableScrollRef}
          className="clients-table-scroll h-[min(60vh,600px)] overflow-auto rounded-xl border border-slate-100"
        >
          <Table loading={loading} head={["Technician", "Phone", "Items taken", "Actions"]} empty={!filtered.length}>
            {filtered.slice(0, visibleCount).map((technician) => (
              <tr key={technician.id} className="hover:bg-slate-50">
                <td className="px-3 py-3 font-medium">{technician.name}</td>
                <td className="px-3 py-3">{technician.phone || "-"}</td>
                <td className="px-3 py-3">
                  <IconButton label={`View items taken by ${technician.name}`} onClick={() => setViewingItems(technician)}>
                    <Eye className="size-4" />
                  </IconButton>
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <IconButton label="Edit" onClick={() => openForm(technician)}>
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
              aria-label="Loading more technicians as you scroll"
            >
              {isLoadingMore && (
                <LoaderCircle
                  className="size-5 animate-spin text-red-600"
                  role="status"
                  aria-label="Loading more technicians"
                />
              )}
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={Boolean(viewingItems)}
        onClose={() => setViewingItems(null)}
        title={`${viewingItems?.name ?? "Technician"} — Items taken`}
        subtitle="Items taken to pay later"
        size="full"
        tall
      >
        {viewingItems && (() => {
          const technicianPurchases = purchases.filter((purchase) => purchase.technician_id === viewingItems.id);
          const paidTotal = technicianPurchases.reduce((total, purchase) => total + techPaidAmount(purchase), 0);
          const pendingTotal = technicianPurchases.reduce((total, purchase) => total + techDueAmount(purchase), 0);

          return (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-700">Paid</p>
                  <p className="mt-1 text-base font-semibold text-emerald-800">{formatMoney(paidTotal)}</p>
                </div>
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="text-xs text-red-700">Pending</p>
                  <p className="mt-1 text-base font-semibold text-red-800">{formatMoney(pendingTotal)}</p>
                </div>
              </div>

              {technicianPurchases.length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-300 text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Item</th>
                        <th className="px-3 py-2.5 font-semibold">Taken</th>
                        <th className="px-3 py-2.5 font-semibold">Returned</th>
                        <th className="px-3 py-2.5 font-semibold">Selling price</th>
                        <th className="px-3 py-2.5 font-semibold">Amount</th>
                        <th className="px-3 py-2.5 font-semibold">Paid</th>
                        <th className="px-3 py-2.5 font-semibold">Due</th>
                        <th className="px-3 py-2.5 font-semibold">Payment</th>
                        <th className="px-3 py-2.5 font-semibold">Receive payment</th>
                        <th className="px-3 py-2.5 font-semibold">Date</th>
                        <th className="px-3 py-2.5 font-semibold">Return</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {technicianPurchases.map((purchase) => {
                        const busy = updatingPaymentPurchaseId === purchase.id;
                        const due = techDueAmount(purchase);
                        return (
                        <tr key={purchase.id}>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{purchase.item_name}</td>
                          <td className="px-3 py-2.5">{purchase.quantity}</td>
                          <td className="px-3 py-2.5">{purchase.returned_quantity}</td>
                          <td className="px-3 py-2.5">{formatMoney(purchase.unit_price)}</td>
                          <td className="px-3 py-2.5 font-medium">{formatMoney(purchase.total_amount)}</td>
                          <td className="px-3 py-2.5 text-emerald-700">{formatMoney(techPaidAmount(purchase))}</td>
                          <td className="px-3 py-2.5 text-red-700">{formatMoney(due)}</td>
                          <td className="px-3 py-2.5">
                            <span className={cn(
                              "whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium",
                              purchase.payment_status === "paid" && "bg-emerald-50 text-emerald-700",
                              purchase.payment_status === "partial" && "bg-blue-50 text-blue-700",
                              purchase.payment_status === "pending" && "bg-amber-50 text-amber-700",
                            )}>
                              {STATUS_LABEL[purchase.payment_status] ?? "Pending"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {due > 0 && (
                                <>
                                  <Input
                                    aria-label={`Amount paid now for ${purchase.item_name}`}
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    max={due}
                                    value={paymentInputs[purchase.id] ?? ""}
                                    onChange={(event) => setPaymentInputs((current) => ({
                                      ...current,
                                      [purchase.id]: event.target.value,
                                    }))}
                                    className="w-28"
                                    placeholder="Amount"
                                  />
                                  <Button size="sm" disabled={busy} onClick={() => receivePayment(purchase)}>
                                    Pay
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                loading={busy}
                                onClick={() => togglePurchasePaymentStatus(purchase)}
                                className="whitespace-nowrap"
                              >
                                Mark {purchase.payment_status === "paid" ? "pending" : "paid"}
                              </Button>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(purchase.purchase_date)}</td>
                          <td className="px-3 py-2.5">
                            {purchase.payment_status !== "paid"
                              && purchase.quantity > purchase.returned_quantity ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  aria-label={`Quantity to return for ${purchase.item_name}`}
                                  type="number"
                                  min="1"
                                  max={purchase.quantity - purchase.returned_quantity}
                                  value={returnQuantities[purchase.id] ?? ""}
                                  onChange={(event) => setReturnQuantities((current) => ({
                                    ...current,
                                    [purchase.id]: event.target.value,
                                  }))}
                                  className="w-20 text-center"
                                  placeholder="Qty"
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={returningPurchaseId === purchase.id}
                                  loading={returningPurchaseId === purchase.id}
                                  onClick={() => returnPurchaseItem(purchase)}
                                >
                                  Return
                                </Button>
                              </div>
                            ) : purchase.quantity === purchase.returned_quantity ? (
                              <span className="text-xs text-slate-500">Fully returned</span>
                            ) : null}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  No items have been recorded for this technician.
                </p>
              )}
              <p className="text-xs text-slate-500">
                Type an amount and press Pay to record a part payment. Returning items reduces what is due.
              </p>
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit Technician" : existingTechnician ? `Add Items · ${existingTechnician.name}` : "Add Technician"}
        size="lg"
      >
        <form onSubmit={saveTechnician} className="space-y-4">
          {editing ? (
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
                placeholder="Enter technician name"
              />
            </Field>
          ) : (
            /* Name: shows existing technicians to pick from, or adds a new one */
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-slate-700">
                Technician <span className="text-red-600">*</span>
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={form.name}
                  onChange={(event) => onNameChange(event.target.value)}
                  onFocus={() => setNameListOpen(true)}
                  onBlur={() => setNameListOpen(false)}
                  onKeyDown={(event) => {
                    if (!nameListOpen) return;
                    if (event.key === "Enter") {
                      // Enter just closes the list. A name that isn't an exact match counts as a NEW technician;
                      // existing ones are only used when typed exactly or clicked in the list.
                      event.preventDefault();
                      setNameListOpen(false);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      setNameListOpen(false);
                    }
                  }}
                  required
                  autoFocus
                  autoComplete="off"
                  placeholder="Search existing or type a new name"
                  aria-label="Technician name"
                  className="pl-10"
                />
              </div>

              {nameListOpen && (technicians.length > 0 || form.name.trim()) && (
                <div
                  role="listbox"
                  aria-label="Existing technicians"
                  // Keep focus in the input while clicking the list
                  onMouseDown={(event) => event.preventDefault()}
                  className="max-h-56 animate-fade-in overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
                >
                  {nameMatches.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="option"
                      aria-selected={t.id === existingId}
                      onClick={() => chooseTechnician(t)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-red-50",
                        t.id === existingId && "bg-red-50",
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold uppercase text-slate-600">
                        {t.name.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{t.name}</span>
                        <span className="block truncate text-xs text-slate-500">{t.phone || "No phone number"}</span>
                      </span>
                      {t.id === existingId && <Check className="size-4 shrink-0 text-red-600" />}
                    </button>
                  ))}
                  {form.name.trim() && !exactMatch && (
                    <button
                      type="button"
                      onClick={() => setNameListOpen(false)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100">
                        <UserPlus className="size-4" />
                      </span>
                      Add &quot;{form.name.trim()}&quot; as a new technician
                    </button>
                  )}
                  {!form.name.trim() && nameMatches.length === 0 && (
                    <p className="px-3 py-3 text-center text-sm text-slate-500">No technicians yet. Type a name to add one.</p>
                  )}
                </div>
              )}

              {form.name.trim() && !nameListOpen && (
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    existingTechnician ? "text-blue-700" : "text-emerald-700",
                  )}
                >
                  {existingTechnician ? (
                    <>
                      <UserCheck className="size-3.5" /> Existing technician. Items will be added to their account.
                    </>
                  ) : (
                    <>
                      <UserPlus className="size-3.5" /> New technician will be added.
                    </>
                  )}
                </p>
              )}
            </div>
          )}
          <Field label="Phone">
            <Input
              type="tel"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Enter phone number"
            />
          </Field>
          {!editing && (
            <section className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Items taken</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Type the item name manually, then enter the quantity and selling price.</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setItemDrafts((current) => [
                    ...current,
                    { id: nextItemId.current++, customName: "", quantity: "1", unitPrice: "", paymentStatus: "pending", paidAmount: "" },
                  ])}
                >
                  <Plus className="size-4" /> Add item
                </Button>
              </div>

              {itemDrafts.length === 0 ? (
                <p className="text-xs text-slate-500">No items added.</p>
              ) : (
                <div className="space-y-2">
                  {itemDrafts.map((draft) => (
                    <div key={draft.id} className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_80px_110px_110px_32px]">
                      <div className="col-span-2 space-y-2 sm:col-span-1">
                        <Field label="Item name">
                          <Input
                            autoFocus
                            aria-label="Item name"
                            value={draft.customName}
                            onChange={(event) => setItemDrafts((current) => current.map((item) =>
                              item.id === draft.id ? { ...item, customName: event.target.value } : item,
                            ))}
                            placeholder="Type item name"
                          />
                        </Field>
                      </div>
                      <Field label="Quantity">
                        <Input
                          type="number"
                          min="1"
                          value={draft.quantity}
                          onChange={(event) => setItemDrafts((current) => current.map((item) =>
                            item.id === draft.id ? { ...item, quantity: event.target.value } : item,
                          ))}
                        />
                      </Field>
                      <Field label="Sell price">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.unitPrice}
                          onChange={(event) => setItemDrafts((current) => current.map((item) =>
                            item.id === draft.id ? { ...item, unitPrice: event.target.value } : item,
                          ))}
                          placeholder="0.00"
                        />
                      </Field>
                      <Field label="Status">
                        <Select
                          value={draft.paymentStatus}
                          onChange={(event) => setItemDrafts((current) => current.map((item) =>
                            item.id === draft.id
                              ? {
                                  ...item,
                                  paymentStatus: event.target.value as TechnicianPurchasePaymentStatus,
                                }
                              : item,
                          ))}
                        >
                          <option value="paid">Paid</option>
                          <option value="partial">Part paid</option>
                          <option value="pending">Pending</option>
                        </Select>
                      </Field>
                      <div className="self-end sm:self-start sm:pt-[30px]">
                        <IconButton
                          label="Remove item"
                          variant="danger"
                          onClick={() => setItemDrafts((current) => current.filter((item) => item.id !== draft.id))}
                        >
                          <Minus className="size-4" />
                        </IconButton>
                      </div>
                      {draft.paymentStatus === "partial" && (() => {
                        const total = Number(draft.quantity) * Number(draft.unitPrice);
                        const paid = Number(draft.paidAmount) || 0;
                        return (
                          <div className="col-span-2 grid items-end gap-2 rounded-xl bg-blue-50/60 p-2 sm:col-span-5 sm:grid-cols-[180px_1fr]">
                            <Field label="Amount paid now">
                              <Input
                                type="number"
                                min="1"
                                step="0.01"
                                value={draft.paidAmount}
                                onChange={(event) => setItemDrafts((current) => current.map((item) =>
                                  item.id === draft.id ? { ...item, paidAmount: event.target.value } : item,
                                ))}
                                placeholder="0.00"
                              />
                            </Field>
                            <p className="pb-2.5 text-xs text-slate-600">
                              Total {formatMoney(total || 0)} · Paid {formatMoney(paid)} ·{" "}
                              <span className="font-medium text-red-700">Due {formatMoney(Math.max((total || 0) - paid, 0))}</span>
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Update" : existingTechnician ? (itemDrafts.length ? "Add Items" : "Save") : "Add Technician"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}